import { History } from "lucide-react";
import { redirect } from "next/navigation";

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
import { utcMinute } from "@/lib/utc-time";

/**
 * sync 이력 (7단계 — DESIGN §6.68). PRODUCT §7.7 라우트 표의 마지막 칸이다.
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

export default async function LogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  /**
   * ⚠️ **보관돼도 현 멤버가 읽는다** (logs-rework spec 완료조건 11) — 보관 사건과 그 직전 기록을
   * 확인하려고 **복원해야 하는 순환**을 끊는다. 쓰기는 정책을 안 주는 Server Action 쪽에서 그대로
   * 막히고, 제거된 멤버는 여전히 `not-found`다. 이 화면 하나만 `read`를 준다.
   */
  const { projectId, archived } = await requireProjectAccess({
    slug,
    permission: "translation:write",
    archivedPolicy: "read",
  });
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
      <PanelHeader width="fluid" description={m.logs.description}>
        {/* ⚠️ **breadcrumb이 없다** (8-4 — DESIGN §0) — 프로젝트 하위 화면 다섯에서 함께 지웠다.
            위로 가는 길은 사이드바가 든다(프로젝트 구역 여섯이 항상 보인다). */}
        <h1 className="flex min-h-9 items-center text-lg font-medium">{m.common.nav.logs}</h1>
      </PanelHeader>

      <PanelBody width="fluid" className="space-y-6">
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
                            className="focus-visible:ring-ring text-xs text-blue-600 focus-visible:ring-2 focus-visible:outline-none"
                          >
                            {m.translations.publish.viewLink}
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
          ⚠️ **페이지네이션이 링크 하나다** (DESIGN §6.68) — 클라이언트 상태가 0이라 뒤로 가기·공유·
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
