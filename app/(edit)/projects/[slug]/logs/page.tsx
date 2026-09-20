import { History, SearchX } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EventDetail } from "@/components/logs/event-detail";
import { EventDialog } from "@/components/logs/event-dialog";
import { EventRow } from "@/components/logs/event-row";
import { LogFilters } from "@/components/logs/log-filters";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { canPerform } from "@/lib/auth/permission";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { clearedLogsQuery, encodeCursor, hasNarrowing, logsQuery, parseLogFilter, type LogSearchParams } from "@/lib/events/filter";
import { loadEvent, loadEventActors, loadEvents } from "@/lib/events/query";
import { coverageBoundaryIndex, groupByDay } from "@/lib/events/view";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 프로젝트 **전체 활동 이력** (logs-rework — 시안 `design_handoff_project_logs`, 아트보드 1a–1l).
 *
 * ⚠️ **게이트가 `translation:write`다, OWNER 전용이 아니다.** "내가 보낸 게 실제로 갔나"를 묻는
 * 사람이 번역자이고, `project:settings` 뒤에 두면 그 질문에 답할 화면이 그 사람에게 없다.
 *
 * ⚠️ **보관돼도 현 멤버가 읽는다** (완료조건 11) — 보관 사건과 그 직전 기록을 확인하려고 복원해야
 * 하는 순환을 끊는다. 쓰기는 정책을 안 주는 Server Action 쪽에서 그대로 막힌다.
 *
 * ⚠️ **`try`를 쓰지 않는다** (결정 16). 조회 실패는 던져서 **페이지 전체**가 `error.tsx`가 되어야
 * 한다 — 빈 목록으로 접으면 "아직 사건이 없다"와 "물어보지 못했다"가 바이트 단위로 같아진다
 * (POSTMORTEM 2026-09-03). 부분 오류·마지막 성공 목록 보존은 만들지 않는다.
 *
 * ⚠️ **상세도 이 렌더가 낸다** (결정 2) — `?event=`가 있으면 같은 페이지가 640 패널을 함께 그린다.
 * Route Handler도 클라이언트 fetch도 없으므로 스키마가 두 벌이 되지 않는다.
 *
 * ⚠️ **자동 갱신·폴링이 0건이다.** 갱신 수단은 [Refresh] 하나이고 `Running…`은 조회 시점 스냅샷이다.
 */
export default async function LogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<LogSearchParams>;
}) {
  const { slug } = await params;
  const { projectId, role, archived } = await requireProjectAccess({
    slug,
    permission: "translation:write",
    archivedPolicy: "read",
  });
  const filter = parseLogFilter(await searchParams);

  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { repoOwner: true, repoName: true, archivedAt: true, activityCoverageStartedAt: true },
  });
  // 인가는 지났는데 행이 없다 — 그 사이에 지워진 경우다. 문구가 존재 여부를 말하지 않는 곳으로 보낸다.
  if (project === null) redirect(`${routes.projects()}?e=not-found`);

  const [sources, actors, page, openEvent] = await Promise.all([
    prisma.translationSurface.findMany({ where: { projectId, archivedAt: null }, select: { slug: true }, orderBy: { slug: "asc" } }),
    loadEventActors(prisma, projectId),
    loadEvents(prisma, projectId, filter),
    // ⚠️ **상세 조회는 목록 필터와 독립이다** (결정 15) — 필터 밖 이벤트도 열되 목록은 그대로 둔다.
    filter.event === null ? Promise.resolve(null) : loadEvent(prisma, projectId, filter.event),
  ]);

  // ⚠️ **`now`를 한 번 만들어 내린다** — 행마다 만들면 같은 페이지 안에서 기준이 흔들린다.
  const now = new Date();
  const groups = groupByDay(page.rows, now);
  const boundary = coverageBoundaryIndex(page.rows, project.activityCoverageStartedAt, filter.cursor);
  const href = (ref: string) => routes.logs(slug, { ...logsQuery(filter), event: ref });
  const closeHref = routes.logs(slug, { ...logsQuery(filter), event: undefined });
  // ⚠️ **판정은 `hasNarrowing` 하나다** — 같은 규칙을 화면이 다시 조립하면 축이 늘 때 한쪽만 고쳐진다.
  const narrowed = hasNarrowing(filter);

  let index = 0;

  return (
    <>
      {/*
        ⚠️ **머리와 본문이 형제다** — 머리는 고정, 본문만 스크롤한다 (`content-panel.tsx`).
        ⚠️ **총계 배지가 없다** — 키셋 페이지네이션이라 셀 수 있는 총계가 없고, 지어낸 총계·성공률
        카드를 두지 않는 것이 이 화면의 규칙이다.
      */}
      <PanelHeader width="fluid" description={archived ? m.logs.archived.description : m.logs.description}>
        <LogFilters slug={slug} filter={filter} sources={sources} actors={actors} refreshable={!archived} />
      </PanelHeader>

      <PanelBody width="fluid" className="space-y-4">
        {page.rows.length === 0 ? (
          narrowed ? (
            /* ⚠️ **빈 이력과 원인이 반대다** — 하나는 프로젝트가 비었고 하나는 내가 좁혔다. */
            <EmptyState
              icon={SearchX}
              title={m.logs.noMatch.title}
              description={m.logs.noMatch.description}
              action={
                <ButtonLink href={routes.logs(slug, clearedLogsQuery(filter))} variant="primary">
                  {m.logs.filters.clear}
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState icon={History} title={m.logs.empty.title} description={m.logs.empty.description} />
          )
        ) : (
          groups.map((group) => (
            <div key={group.dayKey} className="contents">
              {/*
                ⚠️ **경계선이 경계가 드러나는 행 바로 위에 한 번** 선다 (spec §7.1) — 페이지 경계에
                걸리면 아래 페이지가 들고, 커서가 이미 과거면 그리지 않는다.
              */}
              <div className="border-border overflow-hidden rounded-xl border bg-white">
                <div className="flex items-center gap-2 p-4">
                  <h2 className="text-[15px] font-medium">{group.dayKey}</h2>
                  {group.label !== group.dayKey && <span className="text-muted-foreground text-xs">{group.label}</span>}
                </div>
                {group.rows.map((row) => {
                  const showBoundary = index === boundary && project.activityCoverageStartedAt !== null;
                  index += 1;
                  return (
                    <div key={row.id} className="border-border border-t first:border-foreground/[0.06]">
                      {showBoundary && (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <span className="bg-border h-px flex-1" />
                          <span className="text-muted-foreground text-center text-xs text-pretty">
                            {m.logs.coverage(project.activityCoverageStartedAt!.toISOString().slice(0, 10))}
                          </span>
                          <span className="bg-border h-px flex-1" />
                        </div>
                      )}
                      <div id={`event-${row.ref}`} tabIndex={-1}>
                        <EventRow row={row} href={href(row.ref)} now={now} archived={archived} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/*
          ⚠️ **페이지네이션이 링크 하나다** — 클라이언트 상태가 0이라 뒤로 가기·공유·새로고침이 전부
          그냥 된다. 총 페이지 수를 만들지 않는 것이 같은 규칙이다.
        */}
        <div className="flex items-center gap-3">
          {page.nextCursor !== null && (
            <ButtonLink
              href={routes.logs(slug, { ...logsQuery(filter), cursor: encodeCursor(page.nextCursor) })}
              variant="default"
            >
              {m.logs.older}
            </ButtonLink>
          )}
          <span className="text-muted-foreground text-xs">
            {page.nextCursor === null && page.rows.length > 0 ? m.logs.page.noOlder : m.logs.page.perPage}
          </span>
        </div>

        {archived && project.archivedAt !== null && (
          <div className="border-border flex items-start gap-2.5 rounded-[10px] border p-4">
            <span className="text-muted-foreground flex-1 text-sm">
              {m.logs.archived.restoreLine(project.archivedAt.toISOString().slice(0, 10))}
            </span>
            {/* ⚠️ **복원 링크는 OWNER에게만** — EDITOR에게 누를 수 없는 것을 보이지 않는다. */}
            {canPerform(role, "project:settings") && (
              <Link
                href={routes.settings(slug)}
                className="border-border hover:bg-accent focus-visible:ring-ring inline-flex h-9 shrink-0 items-center rounded-[10px] border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                {m.logs.archived.restoreAction}
              </Link>
            )}
          </div>
        )}
      </PanelBody>

      {filter.event !== null && (
        <EventDialog closeHref={closeHref} returnFocusId={`event-${filter.event}`}>
          {openEvent === null ? (
            /* ⚠️ **상세 대상 없음은 조회 실패와 다르다** — 없는 참조·다른 프로젝트의 참조가 여기다. */
            <div className="flex flex-col gap-1 p-6">
              <h2 className="text-lg font-medium">{m.logs.detail.missing.title}</h2>
              <p className="text-muted-foreground text-sm">{m.logs.detail.missing.description}</p>
            </div>
          ) : (
            <EventDetail
              row={openEvent}
              slug={slug}
              now={now}
              archived={archived}
              canOpenSettings={canPerform(role, "project:settings")}
              repoUrl={`https://github.com/${project.repoOwner}/${project.repoName}`}
            />
          )}
        </EventDialog>
      )}
    </>
  );
}
