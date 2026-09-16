import { redirect } from "next/navigation";

import { HomeActions, HomeHeaderActions, HomeNotices, HomeTitle } from "@/components/home/actions";
import { AttentionCard } from "@/components/home/attention-card";
import { CountCards } from "@/components/home/count-cards";
import { LogsCard } from "@/components/home/logs-card";
import { MetaColumn } from "@/components/home/meta-column";
import { ProjectNotReady } from "@/components/project-not-ready";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { canPerform } from "@/lib/auth/permission";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { loadConnectionHealth } from "@/lib/github";
import { logFailure } from "@/lib/github-connect/log";
import { attentionItems } from "@/lib/home/attention";
import { countCards } from "@/lib/home/cards";
import { metaRows } from "@/lib/home/meta";
import { ACTIVITY_LIMIT, ACTIVITY_WINDOW_DAYS, recentActivity } from "@/lib/home/overview";
import { planHomeState } from "@/lib/home/state";
import {
  loadActors, loadLastSyncNewKeys, loadProjectListAggregates, loadRecentEdits, loadRecentPublishes, loadReviewAttention,
} from "@/lib/keys/query";
import { actorLabel } from "@/lib/keys/view";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { isImportFailureCode } from "@/lib/projects/import-status";
import { failing, reviewByLocale, summaryQueue } from "@/lib/projects/list";
import { pullNumberFrom } from "@/lib/projects/remote-plan";
import { routes } from "@/lib/routes";

/**
 * 프로젝트 Home — **진입의 착지점** (PRODUCT §7.7 결정 1).
 *
 * 블록 셋 + 메타 열이다: **카운트 카드 넷**(지금 무엇이 몇 개인가) · **`Needs your attention`**
 * (지금 무엇을 하면 되나) · **`Recent logs`**(최근에 무슨 일이 있었나) · 오른쪽 `Project` 메타.
 *
 * ⚠️ **프로젝트 합계를 말하는 자리가 여기뿐이다** (PRODUCT §7.7 결정 2의 정정). 결정 2는 "다른
 * 화면의 지표를 복제하지 않는다"였는데, **표면이 여럿이 되면서 번역 화면 툴바의 수는 한 표면의
 * 것**이 됐다. 그래서 Home이 합계를 소유하되 제약이 하나 붙는다: **합계는 표면별 값의 합으로만
 * 만든다** — 별도 집계 경로를 만들면 그것이 곧 네 번째 사본이다.
 *
 * ⚠️ **화면에 `pull`·`push` 낱말이 0이다** (spec §3.3-7). 표시는 `Sync`(리포 → 앱)와
 * `Publish`(앱 → 리포) 둘뿐이고 **코드 식별자는 그대로다**.
 *
 * ⚠️ **최상단에서 던진다.** 조건부 렌더는 차단이 아니다 — App Router가 레이아웃과 페이지를 병렬로
 * 렌더해 페이지가 이미 실행되고 RSC 페이로드에 데이터가 실린다 (POSTMORTEM 2026-08-31, 실측 1.3MB).
 * `2c`·`2d`에서 `[Reconnect]`·`[Project settings]`를 감추는 것은 **편의**이고, 차단은 `/settings`의
 * `requireProjectAccess({ permission: "project:settings" })`가 든다.
 *
 * ⚠️ **보관은 전면 교체가 아니라 배너다** (spec §8 `2d`) — `ProjectArchived`의 소비자가 하나 줄었다.
 * **그 컴포넌트를 지우지 않는다**: 번역·로케일·멤버·이력 화면이 계속 쓴다.
 *
 * ⚠️ **보관된 프로젝트에서 첫·넷째 카드가 0이 된다** — 캔버스 `2d`는 "값 유지"이지만, 그 둘의 raw
 * 집계가 SQL에서 `p."archivedAt" IS NULL`을 건다(`loadProjectListAggregates`의 4·5). 그것을 피하려면
 * **미발송 술어의 넷째 벌**을 만들어야 하고 CLAUDE.md가 그것을 금지한다. 보조 줄이 그 상태를 말하는
 * 쪽을 골랐다 — 캔버스와의 **의도된 이탈**이다 (`docs/DESIGN.md`).
 */

/**
 * ⚠️ **Server Action은 자기를 부른 페이지 세그먼트의 `maxDuration`을 쓴다** (`app/api/*`의 값이
 * 아니다). 이 화면의 `[Sync]`가 `runRepositoryImport`를 부르고 그것은 로케일 파일 수만큼 blob을
 * 받는다 — 빠뜨리면 증상이 **"큰 리포에서만 실패"**라 재현이 어렵다.
 */
export const maxDuration = 60;

export default async function ProjectHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { projectId, role, archived } = await requireProjectAccess({ slug, permission: "translation:write" });

  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      installationId: true,
      repositoryId: true,
      repoOwner: true,
      repoName: true,
      baseBranch: true,
      createdAt: true,
      archivedAt: true,
      lastPublishedAt: true,
      lastPrUrl: true,
      surfaces: {
        where: { archivedAt: null },
        orderBy: { slug: "asc" },
        select: {
          id: true, slug: true, archivedAt: true, lastCommitSha: true, lastCommitAt: true,
          lastImportError: true, lastImportStartedAt: true, lastImportFailedAt: true,
          locales: { select: { code: true, name: true, isBase: true, orphaned: true, createdAt: true } },
        },
      },
      _count: { select: { members: true } },
    },
  });
  // 인가는 지났는데 행이 없다 — 그 사이에 지워진 경우다. 문구가 존재 여부를 말하지 않는 곳으로 보낸다.
  if (project === null) redirect(`${routes.projects()}?e=not-found`);

  /**
   * 첫 적재 전에는 볼 것이 없다. **정책과 문구는 `ProjectNotReady`가 든다** — 번역 화면도 같은
   * 갈래를 만나고, 이 화면이 착지점이라 그것을 **먼저** 만나는 자리가 여기다.
   */
  if (planProjectReadiness(project) !== "ready") return <ProjectNotReady slug={slug} role={role} />;

  // 기준 시각을 서버에서 한 번 만든다 — 항목마다 부르면 창의 경계와 상대 시각의 기준이 갈린다.
  const now = new Date();
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  /**
   * ⚠️ **한 라운드다** (POSTMORTEM 2026-09-05 — 병목이 행 수가 아니라 함수 리전이었다). 조회가
   * 여섯이라 순차로 보내면 도쿄 왕복이 여섯 번 쌓인다. `actors`만 두 번째 라운드인 것은 **첫
   * 라운드의 결과에 의존해서**다.
   *
   * ⚠️ **연결 조회는 `installationId`가 있을 때만 GitHub을 친다** — `loadConnectionHealth`가 그
   * 가드를 든다. GitHub 장애는 값(`unknown`)으로 오므로 이 화면이 그것에 죽지 않는다.
   */
  const [aggregates, edits, review, newKeys, publishes, health] = await Promise.all([
    loadProjectListAggregates(prisma, [projectId]),
    loadRecentEdits(prisma, projectId, ACTIVITY_LIMIT),
    loadReviewAttention(prisma, projectId),
    loadLastSyncNewKeys(prisma, projectId),
    loadRecentPublishes(prisma, projectId, since, ACTIVITY_LIMIT),
    /**
     * ⚠️ **여기서만 던지는 것을 삼킨다** (code-review 2026-09-15 🟡4). `probeRepo`는 GitHub 실패를
     * 값으로 주지만 `createApp()`은 `GITHUB_APP_ID`·PEM이 깨졌을 때 **던진다** — 설정 화면에서는
     * 그것이 의도지만(설정 오류를 일시 장애로 접으면 영원히 "잠시 뒤 다시"가 뜬다), 여기는
     * **모든 프로젝트의 착지 화면**이라 같은 조건에서 앱 전체가 500이 된다.
     * **시끄러운 신호는 설정 화면 하나에 남긴다** — 그 화면이 OWNER가 고치러 가는 자리다.
     * 여기서는 `unknown`이라 배너가 안 서고, 원인은 로그에만 남는다.
     */
    loadConnectionHealth(project).catch((error: unknown) => {
      logFailure("home-connection-health", error);
      return { status: "unknown" } as const;
    }),
  ]);
  // **렌더되는 항목만** 지난다 — 903키 리포에서 전 행의 편집자를 조회하지 않는다.
  const actors = await loadActors(prisma, [
    ...new Set([...edits.map((e) => e.updatedBy), ...review.flatMap((r) => (r.updatedBy === null ? [] : [r.updatedBy]))]),
  ]);

  /**
   * ⚠️ **`archived: false`를 고정으로 넘긴다** (design §2.1). 그 필터는 **계정 합계**의 것이고
   * ("지금 내가 할 일"의 합계에서 보관을 뺀다), Home은 프로젝트 하나라 그 축이 존재하지 않는다 —
   * 그대로 넘기면 보관하는 순간 카드 넷이 전부 0이 된다.
   */
  const counts = summaryQueue({ projects: [{ projectId, archived: false }], ...aggregates });

  const surfaces = project.surfaces.map((surface) => ({
    ...surface,
    // DB 컬럼의 문자열이라 판정 함수로 거른다 — 모르는 값은 무시한다.
    importError: isImportFailureCode(surface.lastImportError) ? surface.lastImportError : null,
    importing: surface.lastImportStartedAt !== null,
  }));
  const state = planHomeState({ archived, connection: health, surfaces, counts });

  const lastSyncAt = surfaces
    .map((s) => s.lastCommitAt)
    .filter((at): at is Date => at !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const keys = [...aggregates.keyTotals.values()].reduce((sum, n) => sum + n, 0);
  const bySurface = new Map(surfaces.map((s) => [s.id, s]));

  /**
   * 한 번도 안 채워진 로케일 — 그 로케일에 **값이 있는 셀이 하나도 없는** 경우다.
   *
   * ⚠️ **`activeLocaleProgress`에 먹이지 않는다** (code-review 2026-09-15 🟡1). 그 함수는 셀을 행으로
   * 받는데 여기 있는 것은 그룹 카운트라, 먹이려면 `count`만큼 객체를 만들어야 한다 — 903키 × 59로케일
   * 리포에서 5만 개다. 답할 질문이 "합이 0인가" 하나라 카운트에서 바로 센다.
   *
   * ⚠️ **orphaned 로케일은 뺀다** — 그 파일은 리포에서 사라졌고 편집이 막혀 있어 일이 아니다.
   * ⚠️ **분모가 0이면 항목이 아니다** — 키가 없는 표면에서 "한 번도 안 채워졌다"는 참이지만 채울
   * 것이 없다.
   */
  const filled = new Set(
    aggregates.cells.filter((cell) => cell.count > 0).map((cell) => `${cell.surfaceId} ${cell.localeCode}`),
  );
  const neverFilled = surfaces.flatMap((surface) => {
    const total = aggregates.keyTotals.get(surface.id) ?? 0;
    if (total === 0) return [];
    return surface.locales
      .filter((locale) => !locale.orphaned && !filled.has(`${surface.id} ${locale.code}`))
      .map((locale) => ({ surfaceSlug: surface.slug, code: locale.code, name: locale.name, keys: total, at: locale.createdAt }));
  });

  // 배너가 지목하는 표면 하나 — slug 오름차순의 첫째다. 나머지 실패는 항목으로 남는다.
  const failed = surfaces.find((s) => failing(s)) ?? null;

  const items = attentionItems({
    state,
    bannerSurface: failed?.slug ?? null,
    surfaces: surfaces.map((s) => ({ slug: s.slug, importError: s.importError, importing: s.importing, lastImportFailedAt: s.lastImportFailedAt })),
    review: review.flatMap((row) => {
      const surface = bySurface.get(row.surfaceId);
      if (surface === undefined) return [];
      const locale = surface.locales.find((l) => l.code === row.localeCode);
      return [{
        surfaceSlug: surface.slug, code: row.localeCode, name: locale?.name ?? row.localeCode,
        count: row.count, at: row.at, updatedBy: row.updatedBy,
      }];
    }),
    neverFilled,
    actors,
  });

  const activity = recentActivity({
    edits: edits.map((e) => ({ ...e, actor: actorLabel(e.updatedBy, actors) })),
    pushes: surfaces.flatMap((s) => (s.lastCommitAt === null ? [] : [{ surfaceSlug: s.slug, at: s.lastCommitAt, newKeys: newKeys.get(s.id) ?? 0 }])),
    publishes: publishes.map((p) => ({ at: p.at, prNumber: pullNumberFrom(p.prUrl), changed: p.changed })),
    // ⚠️ **마지막 하나뿐이다** — 7일 창에 실패가 둘이면 하나만 보인다. 이력이 아니다 (PRODUCT §4.1).
    syncFailures: surfaces.flatMap((s) => (s.lastImportFailedAt === null ? [] : [{ surfaceSlug: s.slug, at: s.lastImportFailedAt }])),
    now, windowDays: ACTIVITY_WINDOW_DAYS, limit: ACTIVITY_LIMIT,
  });

  const paused = state === "not_connected" || state === "archived";

  return (
    /*
      ⚠️ **Provider가 DOM을 만들지 않는다** — `PanelHeader`·`PanelBody`가 `<main>`의 형제여야 머리가
      고정되고 본문만 스크롤한다 (`content-panel.tsx`). [Sync]는 머리에 있고 그 결과·배너는 본문에
      있어서, 상태를 한쪽이 소유하면 다른 쪽이 같은 Dialog를 못 연다.
    */
    /*
      ⚠️ **`key`가 프로젝트를 가른다** — `[slug]`는 param만 바뀌는 같은 세그먼트라 React가 이
      Provider를 같은 자리로 화해시킨다. 없으면 A에서 낸 결과 Alert가 **A의 브랜치 이름을 단 채로**
      B의 Home에 남고 진행 중 잠금까지 넘어온다 (handoff §T9 · `home-screen.test.ts`가 센다).
    */
    <HomeActions key={slug} slug={slug}>
      <PanelHeader width="fluid">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* breadcrumb이 없다 — 이 화면이 프로젝트 루트다. 위로 가는 길은 사이드바가 든다 */}
          <HomeTitle archived={state === "archived"}>{project.name}</HomeTitle>
          <HomeHeaderActions
            slug={slug}
            name={project.name}
            branch={project.baseBranch}
            role={role}
            unsent={counts.toSend}
            paused={paused}
          />
        </div>
      </PanelHeader>

      {/*
        ⚠️ **배너가 머리와 본문 사이에 있다** (캔버스 `2b`·`2c`·`2d` — `margin:0 24px 20px`).
        본문 안에 두면 스크롤과 함께 밀려 올라가고, 그러면 "왜 버튼이 안 눌리나"를 말하는 문장이
        화면 밖으로 나간다 (POSTMORTEM 2026-09-06).

        ⚠️ **무조건 렌더한다** — 결과 Alert가 이 안에 있고, 조건부 분기에 두면 `revalidatePath`가
        방금 받은 결과를 언마운트한다 (POSTMORTEM 2026-09-07).

        ⚠️ **여백을 바깥 래퍼에 두지 않는다** (2026-09-15 리뷰 🔴1). `:empty`는 자식 **요소**가
        하나라도 있으면 거짓인데 `HomeNotices`는 배너가 0개여도 자기 `<div>`를 언제나 렌더한다 —
        래퍼에 `empty:hidden`을 걸면 안쪽만 숨고 바깥 `pb-4`가 남아 **가장 흔한 화면에 16px 유령
        띠**가 선다. 로딩 골격엔 그 띠가 없어 데이터가 도착하는 순간 본문이 그만큼 튄다.
      */}
      <HomeNotices
        slug={slug}
        name={project.name}
        state={state}
        role={role}
        branch={project.baseBranch}
        failedSurface={failed?.slug ?? null}
        reason={failed?.importError ?? null}
        lastSyncAt={lastSyncAt}
        now={now}
      />

      {/*
        ⚠️ **오른쪽 열이 320 고정이고 왼쪽이 `minmax(0,1fr)`이다** (캔버스). `flex-1`로 두면 카드
        안의 긴 문장이 왼쪽 열을 밀어 오른쪽이 좁아진다 — `min-width:auto`가 기본이라서다.
        ⚠️ **간격이 20이다** — 블록 사이도 같은 20이라 세로·가로가 한 격자로 읽힌다. 카드 넷 사이만
        8이고, 그 차이가 넷을 한 덩어리로 묶는다.
      */}
      <PanelBody width="fluid" className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <CountCards
            cards={countCards({
              state, counts,
              surfaces: surfaces.length,
              keys,
              lastSyncAt,
              lastPublishedAt: project.lastPublishedAt,
              reviewByLocale: reviewByLocale(aggregates.locales, aggregates.cells).get(projectId) ?? [],
            })}
            slug={slug}
            now={now}
          />
          <AttentionCard items={items} slug={slug} state={state} now={now} />
          <LogsCard items={activity} slug={slug} now={now} syncedBefore={lastSyncAt !== null} />
        </div>

        <MetaColumn
          rows={metaRows({
            state,
            repoOwner: project.repoOwner,
            repoName: project.repoName,
            baseBranch: project.baseBranch,
            surfaces: surfaces.length,
            locales: [...new Set(surfaces.flatMap((s) => s.locales.filter((l) => !l.orphaned).map((l) => l.code)))].sort(),
            keys,
            members: project._count.members,
            lastSyncAt,
            lastImportFailedAt: failed?.lastImportFailedAt ?? null,
            lastPublishedAt: project.lastPublishedAt,
            lastPrUrl: project.lastPrUrl,
            createdAt: project.createdAt,
            archivedAt: project.archivedAt,
          })}
          slug={slug}
          now={now}
          canOpenSettings={canPerform(role, "project:settings")}
        />
      </PanelBody>
    </HomeActions>
  );
}
