import { ExternalLink, History } from "lucide-react";
import { redirect } from "next/navigation";

import { ProjectArchived } from "@/components/project-archived";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";
import { loadSyncRuns } from "@/lib/sync/query";
import { encodeCursor, syncReasonMessage, syncRunView } from "@/lib/sync/view";
import { firstQueryValues, type Raw } from "@/lib/search-params";

/**
 * sync 이력 (7단계 — sync-runs design §6). PRODUCT §7.7 라우트 표의 마지막 칸이다.
 *
 * ⚠️ **게이트가 `translation:write`다, OWNER 전용이 아니다.** "내가 보낸 게 실제로 갔나"를 묻는
 * 사람이 번역자이고, `project:settings` 뒤에 두면 그 질문에 답할 화면이 그 사람에게 없다.
 *
 * ⚠️ **`try`를 쓰지 않는다.** 조회 실패는 던져서 Next 오류 화면이 되어야 한다 — 빈 표로 접으면
 * "아직 실행이 없다"와 "물어보지 못했다"가 **바이트 단위로 같아진다** (POSTMORTEM 2026-09-03).
 * 그래서 빈 상태는 조회가 성공했을 때만 나온다.
 *
 * ⚠️ **여기에 [Send changes]를 두지 않는다.** 8단계의 🔒 제안을 이 단계가 채택한다 —
 * **`logs`는 과거 이력**이고 "지금 상태 + 행동"은 그 패널이다. 둘을 섞으면 첫날에 경계가 무너진다.
 *
 * ⚠️ **RUNNING 행은 스냅샷이다** — 자동 갱신이 없다. 이 리포에 폴링이 0건이고, 넣으면 "줄임표는
 * 진행 중에만"이라는 규칙 위에 타이머가 하나 더 붙는다. 갱신은 재방문이다.
 */
type Search = Raw<"cursor">;

/**
 * `2026-09-10 12:00 UTC`.
 *
 * ⚠️ **UTC라고 **말한다**.** 서버 렌더라 `toLocaleString`은 서버의 타임존(Vercel은 UTC)을 쓸 뿐
 * 보는 사람의 것이 아니고, 표시를 진짜 로컬로 하려면 클라이언트 컴포넌트가 하나 붙는다. 라벨 없이
 * 내면 사용자가 자기 시간대로 읽고 **밤 사이 실행의 날짜를 하루 어긋나게** 센다.
 * 정확한 값은 `dateTime` 속성이 들고 있고, 상대 시각이 그 아래 보조로 붙는다.
 */
function utcMinute(at: Date): string {
  return `${at.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export default async function LogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const { projectId, role, archived } = await requireProjectAccess({ slug, permission: "translation:write" });
  if (archived) return <ProjectArchived slug={slug} role={role} />;
  const { cursor } = firstQueryValues(await searchParams);

  const prisma = getPrisma();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  // 인가는 지났는데 행이 없다 — 그 사이에 지워진 경우다. 문구가 존재 여부를 말하지 않는 곳으로 보낸다.
  if (project === null) redirect(`${routes.projects()}?e=not-found`);

  const page = await loadSyncRuns(prisma, projectId, cursor);
  // ⚠️ **`now`를 한 번 만들어 내린다** — 행마다 만들면 같은 페이지 안에서 기준이 흔들린다.
  const now = new Date();

  return (
    <>
      {/*
        ⚠️ **머리와 본문이 형제다** — 머리는 고정, 본문만 스크롤한다 (`content-panel.tsx`).
        여백·폭 등급·머리 아래 선은 **프리미티브가 든다**(기본 등급이 `limited` = `max-w-4xl`) —
        화면이 다시 정하면 그 값이 두 번 적용된다.
      */}
      <PanelHeader description={m.logs.description}>
        {/* ⚠️ **breadcrumb이 없다** (8-4 spec Q5) — 프로젝트 하위 화면 다섯에서 함께 지웠다.
            위로 가는 길은 사이드바가 든다(프로젝트 구역 여섯이 항상 보인다). */}
        <h1 className="flex min-h-9 items-center text-lg font-medium">{m.common.nav.logs}</h1>
      </PanelHeader>

      <PanelBody className="space-y-6">
        {/* ⚠️ **표는 Card 밖이다** (로케일·멤버 화면과 같은 관용구) — Card의 `p-4`와 셀의 `px-4`가 겹친다. */}
        {page.rows.length === 0 ? (
          <EmptyState icon={History} title={m.logs.empty.title} description={m.logs.empty.description} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{m.logs.columns.when}</Th>
                <Th>{m.logs.columns.trigger}</Th>
                <Th>{m.logs.columns.result}</Th>
                <Th>{m.logs.columns.changed}</Th>
                <Th>{m.logs.columns.reason}</Th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => {
                const view = syncRunView(row);
                return (
                  <Tr key={row.id}>
                    <Td>
                      {/*
                        ⚠️ **절대 시각이 `dateTime`에 있다.** 이력에서 "2 days ago"만으로는 어느 밤인지
                        못 가른다 — 상대 시각은 보조이고, 브라우저·스크린리더가 정확한 값을 들어야 한다.
                      */}
                      <time dateTime={row.startedAt.toISOString()} className="text-sm">
                        {utcMinute(row.startedAt)}
                      </time>
                      <p className="text-muted-foreground text-xs">{relativeTime(row.startedAt, now)}</p>
                    </Td>
                    <Td>
                      <span className="text-sm">{view.triggerLabel}</span>
                    </Td>
                    <Td>
                      <Badge variant={view.tone}>{view.label}</Badge>
                      {/* 버린 값을 조용히 숨기지 않는다 (ARCHITECTURE §0 불변식 9) — 성공한 행에도 붙는다. */}
                      {row.warnings > 0 && (
                        <p className="mt-1">
                          <Badge variant="warning">{m.logs.warnings(row.warnings)}</Badge>
                        </p>
                      )}
                    </Td>
                    <Td>
                      <span className="text-sm">{row.changed === null ? m.logs.none : row.changed}</span>
                      {row.prUrl !== null && (
                        <p className="mt-1">
                          <a
                            href={row.prUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="focus-visible:ring-ring inline-flex items-baseline gap-1 text-xs text-blue-600 focus-visible:ring-2 focus-visible:outline-none"
                          >
                            {m.translations.publish.viewLink}
                            <ExternalLink className="size-3" aria-hidden />
                          </a>
                        </p>
                      )}
                    </Td>
                    <Td>
                      {view.reasonKey === null ? (
                        <span className="text-muted-foreground text-xs">{m.logs.none}</span>
                      ) : (
                        <span className="text-xs">{syncReasonMessage(view.reasonKey)}</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {/*
          ⚠️ **페이지네이션이 링크 하나다** (design 결정 14) — 클라이언트 상태가 0이라 뒤로 가기·공유·
          새로고침이 전부 그냥 된다. `SYNC_LOG_PAGE_SIZE`는 조회와 화면이 같은 상수를 본다.
        */}
        {page.nextCursor !== null && (
          <div>
            <ButtonLink href={routes.logs(slug, { cursor: encodeCursor(page.nextCursor) })} variant="default">
              {m.logs.older}
            </ButtonLink>
          </div>
        )}
      </PanelBody>
    </>
  );
}
