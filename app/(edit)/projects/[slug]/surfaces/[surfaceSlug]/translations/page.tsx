import { redirect } from "next/navigation";

import { ProjectArchived } from "@/components/project-archived";
import { ProjectNotReady } from "@/components/project-not-ready";
import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { getPrisma } from "@/lib/db";
import { loadConnectionHealth } from "@/lib/github";
import { storedConnection } from "@/lib/github-connect/health";
import { logFailure } from "@/lib/github-connect/log";
import { countUnpublishedBySurface, loadActors, loadProject } from "@/lib/keys/query";
import { loadTranslationDetail, loadTranslationList, loadTranslationTree, withActorLabels } from "@/lib/keys/translation-list";
import { buildPermalink } from "@/lib/keys/view";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { syncBranchFor } from "@/lib/pull/sync-branch";
import { relativeTime } from "@/lib/relative-time";
import { ALL_NAMESPACES, routes } from "@/lib/routes";
import type { Raw } from "@/lib/search-params";
import { requireSurfaceAccess } from "@/lib/surfaces/access";
import { FIRST_KEY, isScreenCanonical, landOnFirstKey, MISSING_LANGUAGES, screenQuery, serializeScreenQuery, statusOf, treeFollowsSearch, withStatus, type TranslationQuery } from "@/lib/translations/query";
import { firstRowAt, inRange, rangeOf, tallyRows } from "@/lib/translations/tree-narrow";

/**
 * 번역 화면 — **트리 · 요약 목록 · 선택 키 상세** 세 패널 (translation-rework — 핸드오프 `2a`, spec §3).
 *
 * 찾는 곳(트리 + 키 목록)과 고치는 곳(선택 키의 전 로케일)을 가른다. 목록은 요약만 싣고, 값은 선택한 키 하나만 읽는다 —
 * 옛 표 화면은 목록에 전 키 × 전 로케일 값을 실었다(ARCHITECTURE §1.95의 `<Textarea>` 2,709개).
 *
 * ⚠️ **draft·이동 확인·Save·Revert는 클라이언트 소유자 하나(`TranslationWorkspace`)가 든다** — 이 페이지는 인가·조회·URL 정규화만 한다.
 */

/**
 * ⚠️ **Server Action은 자기를 부른 페이지 세그먼트의 `maxDuration`을 쓴다** — 이 화면의 Publish가 `triggerPullAction`을 부른다.
 * ⚠️ **`STALE_AFTER_SECONDS`(300)와 Revert의 종료 판정 근거가 이 줄이다** (ARCHITECTURE §5.6.2 · §5.8) — 300을 넘기면 둘 다 깨진다.
 */
export const maxDuration = 60;

/**
 * ⚠️ 이 타입이 URL 계약이다 — `entry-points.test.ts`가 `routes.surfaceTranslations`의 키와 대조한다. 옛 키(`locales`·`focus`·
 * `state=untranslated`)도 받는다 — 옛 링크를 새 요청값으로 옮겨 정규 주소로 redirect한다(design §3 옛 링크).
 */
type Search = Raw<"ns" | "locales" | "q" | "state" | "scope" | "completion" | "missingLocale" | "cursor" | "key" | "keySurface" | "language" | "focus">;

export default async function TranslationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; surfaceSlug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug, surfaceSlug } = await params;
  const raw = await searchParams;

  // ⚠️ **최상단에서 던진다.** 조건부 렌더로 막으면 App Router가 페이지를 이미 실행한 뒤라 RSC 페이로드에 키가 실린다 (POSTMORTEM 2026-08-31).
  const { projectId, surfaceId, role, archived, userId } = await requireSurfaceAccess({ slug, surfaceSlug, permission: "translation:write" });
  if (archived) return <ProjectArchived slug={slug} role={role} />;

  /*
    ⚠️ **화면 요청값은 `screenQuery`다** (translation-tree-range design §3) — 옛 주소(`Untranslated in`·`Complete`·검색어 없는 `scope`·cursor·
    `locales`·`focus`)는 아래에서 위치·언어까지 보정한 **정규 주소로 redirect**한다. 공유·새로고침이 같은 URL을 쓴다.
    ⚠️ **서로 의존하지 않는 조회는 함께 떠난다** (audit-ux #7) — 목록은 늘 전 소스(`scope: "project"`)라 redirect가 바꾸는 값(경로·`ns`·언어)과
    무관하다. 그래서 redirect 판정을 기다리지 않고 같은 라운드에 떠난다(옛 주소에서만 한 번 버려진다). 다른 소스의 상세는 트리가 그 소스를 확인한 뒤다.
  */
  const screen = screenQuery(raw);
  const prisma = getPrisma();
  const firstKey = screen.key === FIRST_KEY;
  const selected = firstKey ? undefined : screen.key;
  const { key: _key, ...unselected } = screen;
  const readDetail = (surface: { id: string } | undefined, key: string | undefined) =>
    key === undefined || surface === undefined ? null : loadTranslationDetail(prisma, { projectId, surfaceId: surface.id, keyId: key });
  const onRoute = screen.keySurface === undefined || screen.keySurface === surfaceSlug;
  /*
    ⚠️ **트리 숫자는 검색만 따른다** (2026-10-02 사용자 — 아래 필터인 Status는 위로 새지 않는다). 검색 + Status면 숫자용으로 **Status 없는 같은 검색**을
    한 번 더 읽는다(같은 라운드). Status 술어를 JS로 다시 쓰지 않는다 — 두 술어가 같은 행을 세야 하는 함정을 design §3이 걷었다. 검색만이면 목록의 행이
    곧 숫자다(추가 읽기 없음).
  */
  const searchOnly = treeFollowsSearch(screen) && statusOf(screen) !== "all"
    ? loadTranslationList(prisma, { projectId, routeSurfaceId: surfaceId, query: { ...withStatus(unselected, "all"), scope: "project" }, pageSize: "all" })
    : null;
  const [project, tree, full, unsentBySurface, early, counted] = await Promise.all([
    loadProject(prisma, projectId, surfaceId),
    loadTranslationTree(prisma, projectId),
    // ⚠️ **화면 목록은 전량이다** (translation-filter-scope) — 눌러서 더 읽는 페이지가 없다. cursor 페이징은 MCP 전용이다.
    loadTranslationList(prisma, { projectId, routeSurfaceId: surfaceId, query: { ...unselected, scope: "project" }, pageSize: "all", ...(selected === undefined ? {} : { selectedKeyId: selected }) }),
    countUnpublishedBySurface(prisma, projectId),
    onRoute ? readDetail({ id: surfaceId }, selected) : null,
    searchOnly,
  ]);
  if (!project) redirect(routes.projects());
  const readiness = planProjectReadiness(project);
  if (readiness !== "ready") return <ProjectNotReady slug={slug} role={role} readiness={readiness} />;

  // 상세의 소스는 `keySurface`가 정한다 — 인가된 프로젝트의 **활성** 표면 안에서만 고른다. 모르는·보관된 소스는 버린다(다른 프로젝트로 넓히지 않는다).
  const keySurface = screen.keySurface === undefined ? undefined : tree.surfaces.find(s => s.slug === screen.keySurface);
  const detail = onRoute ? early : await readDetail(keySurface, selected);
  const { route, query: corrected } = correctLocation(screen, surfaceSlug, { keySurface: screen.keySurface === undefined ? undefined : keySurface?.slug ?? null, detail, real: selected !== undefined });
  const located = withValidLanguage(corrected, tree.surfaces.find(s => s.slug === (detail?.status === "ok" ? detail.key.surfaceSlug : route))?.locales ?? []);
  if (!isScreenCanonical(raw, located) || route !== surfaceSlug) redirect(routes.surfaceTranslations(slug, route, serializeScreenQuery(located)));

  /*
    ⚠️ **늘 전 소스로 읽고 JS로 자른다** (design §3) — 읽기 경로가 하나라 "트리 숫자 = 그 노드를 눌렀을 때의 목록 수"가 구조로 맞는다. 수·선택 포함 여부는
    **자른 행에서 다시 센다** — 로더의 전 소스 값을 그대로 쓰면 범위 밖의 선택을 "결과 안"으로 읽는다(POSTMORTEM 2026-09-23 — 부분 응답을 전체로 해석).
    ⚠️ **트리 이동의 첫 키를 같은 렌더가 싣는다** (audit-ux #18) — 그 위치(경로 소스·`ns`)의 첫 키다. 주소의 예약값은 화면이 `history.replaceState`로 맞춘다.
  */
  const rows = full.rows.filter(row => inRange(row, rangeOf(located, surfaceSlug)));
  const first = firstKey ? firstRowAt(rows, surfaceSlug, located.ns) : undefined;
  const query = firstKey ? landOnFirstKey(located, first) : located;
  const list = {
    ...full,
    rows,
    matchedKeyCount: rows.length,
    incompleteKeyCount: rows.filter(row => row.missingCount > 0).length,
    selectedInResult: first !== undefined ? true : selected === undefined ? null : rows.some(row => row.keyId === selected),
  };
  // 검색 중일 때만 트리 숫자를 검색 일치 수로 — 범위 밖 노드도 Status를 끈 채 그 노드를 눌렀을 때의 목록 수다(조건 9 · 2026-10-02).
  const counts = treeFollowsSearch(located) ? tallyRows((counted ?? full).rows) : null;
  const shown = first === undefined ? detail : await readDetail({ id: surfaceId }, first.keyId);
  const actors = shown?.status === "ok" ? await loadActors(prisma, shown.locales.flatMap(l => l.updatedBy === null ? [] : [l.updatedBy])) : new Map();
  const detailView = shown === null
    ? (query.key === undefined ? null : { absent: true as const, surfaceSlug: query.keySurface ?? surfaceSlug })
    : shown.status === "absent"
      ? { absent: true as const, surfaceSlug: query.keySurface ?? surfaceSlug }
      : (() => {
          const labeled = withActorLabels(shown, actors);
          // permalink는 서버가 만든다 — 그 판정이 사는 모듈(`lib/keys/view.ts`)은 어댑터를 물어 클라이언트가 읽으면 안 된다.
          return {
            key: labeled.key,
            locales: labeled.locales.map(({ code, isBase, value, needsReview, pending, actorLabel }) => ({ code, isBase, value, needsReview, pending, actorLabel })),
            refs: labeled.refs.map(ref => ({ ...ref, href: buildPermalink({ repoOwner: project.repoOwner, repoName: project.repoName, lastCommitSha: labeled.lastCommitSha }, ref) })),
          };
        })();

  /*
    ⚠️ **연결은 DB 판정이 먼저고 GitHub 판정은 스트리밍이다** (ux-drift-unify §3.3 · 🔴 F — #52 재발 경로였다: 끊겨도 Publish·Sync가 켜져 있었다).
    설치·리포 id로 가를 수 있는 둘(`not-connected`·`unpinned`)은 첫 렌더부터 버튼을 끈다 — GitHub 왕복 0. 나머지(App 제거 · 설치 교체 · 리포 교체)는
    `loadConnectionHealth` promise를 **기다리지 않고** 워크스페이스로 내려 도착한 뒤 끈다(설정 화면과 같은 형) — ARCHITECTURE §1.95의 착지 시간을 늘리지 않는다.
    ⚠️ **`memo`를 켠다**(U7 r1 지휘자 결정 — Home과 둘) — 이 화면은 키 클릭·저장마다 다시 렌더되어, 메모 없이는 번역자마다 GitHub 1–2회가 설치 한도를
    먹는다. 표시 전용이라 괜찮다 — 누르면 서버가 다시 판정한다. ⚠️ 거부는 `unknown`으로 접는다 — 버튼을 끄지 않는다(Home과 같다).
  */
  const stored = storedConnection(project);
  const connection = stored !== null ? { status: stored.status } : {
    status: "unknown" as const,
    later: loadConnectionHealth(project, { memo: true }).catch((error: unknown) => {
      logFailure("translations-connection-health", error);
      return { status: "unknown" } as const;
    }),
  };

  return (
    <TranslationWorkspace
      slug={slug}
      routeSurfaceSlug={surfaceSlug}
      role={role}
      userId={userId}
      query={query}
      tree={tree}
      list={list}
      counts={counts}
      detail={detailView}
      unpublished={[...unsentBySurface.values()].reduce((sum, n) => sum + n, 0)}
      publish={{
        /* ⚠️ **`syncBranchFor`를 서버가 부른다** — 그 모듈은 `lib/failure`(node:crypto)를 물어 클라이언트가 물면 안 된다. */
        repo: { owner: project.repoOwner, name: project.repoName, branch: project.baseBranch, syncBranch: syncBranchFor(slug) },
        lastSentLabel: project.lastPublishedAt === null ? null : relativeTime(project.lastPublishedAt, new Date()),
        lastPrUrl: project.lastPrUrl,
      }}
      sync={{ name: project.name, branch: project.baseBranch }}
      baseLocale={project.baseLocale}
      declaredBaseLocale={project.declaredBaseLocale}
      connection={connection}
      writeLock={project.writeLock}
    />
  );
}

/**
 * **검색어 없이 키를 가리키는 링크는 그 키의 위치로 연다** (design §3.1 · 조건 11). 범위가 트리 위치라, 다른 소스나 다른 네임스페이스의 키를 고른
 * 옛 링크(전 소스 범위 시절의 퍼머링크·Logs의 옛 주소)를 그대로 열면 선택 키가 목록 범위 밖에 선다.
 * - 다른 활성 소스의 키 → 그 소스 경로로. 상세가 있으면 `ns`도 그 키의 실제 네임스페이스로(없는 키에서 추측하지 않는다).
 * - 같은 소스라도 선택 키가 `ns` 범위 밖이면 그 키의 네임스페이스로(`ALL_NAMESPACES`는 이미 범위 안이다).
 * - 모르는·보관된 `keySurface`는 버린다(`keySurface === null`). 검색 중에는 범위가 전 소스이거나 사용자가 좁힌 노드라 옮기지 않는다.
 */
function correctLocation(
  screen: TranslationQuery,
  routeSurfaceSlug: string,
  input: { keySurface: string | null | undefined; detail: Awaited<ReturnType<typeof loadTranslationDetail>> | null; real: boolean },
): { route: string; query: TranslationQuery } {
  const query: TranslationQuery = { ...screen };
  if (input.keySurface === null) delete query.keySurface;
  if (!input.real || screen.q !== undefined) return { route: routeSurfaceSlug, query };
  const route = input.keySurface ?? routeSurfaceSlug;
  const detail = input.detail?.status === "ok" ? input.detail : null;
  const outside = route !== routeSurfaceSlug || (query.ns !== ALL_NAMESPACES && detail !== null && detail.key.namespace !== query.ns);
  // 위치가 바뀌면 범위(`scope`)도 따라간다 — 정규화를 한 번 더 지나 파생한다(규칙을 여기 다시 쓰지 않는다).
  return { route, query: outside && detail !== null ? screenQuery(serializeScreenQuery({ ...query, ns: detail.key.namespace })) : query };
}

/**
 * 상세 언어는 **상세 대상 소스의 활성 로케일**이어야 한다(조건 12) — 없는 코드는 정규 주소에서도 지운다. 화면이 언어를 주소에서 다시 읽으므로
 * prop만 지우면 라벨이 바로잡히지 않는다. 없음(All languages)·`@missing`(Missing only)은 보존한다.
 */
function withValidLanguage(query: TranslationQuery, locales: readonly string[]): TranslationQuery {
  if (query.language === undefined || query.language === MISSING_LANGUAGES || locales.includes(query.language)) return query;
  const { language: _dropped, ...rest } = query;
  return rest;
}
