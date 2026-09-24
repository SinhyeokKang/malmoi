import { redirect } from "next/navigation";

import { ProjectArchived } from "@/components/project-archived";
import { ProjectNotReady } from "@/components/project-not-ready";
import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { getPrisma } from "@/lib/db";
import { countUnpublishedBySurface, loadActors, loadProject } from "@/lib/keys/query";
import { loadTranslationDetail, loadTranslationList, loadTranslationTree, withActorLabels } from "@/lib/keys/translation-list";
import { buildPermalink } from "@/lib/keys/view";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { syncBranchFor } from "@/lib/pull/sync-branch";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";
import type { Raw } from "@/lib/search-params";
import { requireSurfaceAccess } from "@/lib/surfaces/access";
import { FIRST_KEY, landOnFirstKey, parseTranslationQuery, serializeTranslationQuery } from "@/lib/translations/query";

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

  // 옛 링크(`state=untranslated` · `locales` · `focus` · `cursor`)는 새 요청값으로 옮겨 정규 주소로 보낸다 — 공유·새로고침이 같은 URL을 쓴다.
  // ⚠️ `cursor`는 더 이상 주소에 싣지 않는다 (audit-ux #19 — More는 `loadMoreTranslationKeys`가 누적한다). 남은 옛 주소는 첫 페이지로 연다.
  const parsed = parseTranslationQuery(raw);
  const legacy = raw.locales !== undefined || raw.focus !== undefined || raw.state === "untranslated" || raw.cursor !== undefined;
  if (legacy) {
    const { cursor: _cursor, ...canonical } = parsed;
    redirect(routes.surfaceTranslations(slug, surfaceSlug, serializeTranslationQuery(canonical)));
  }

  /*
    ⚠️ **서로 의존하지 않는 조회는 함께 떠난다** (audit-ux #7) — 전엔 await 다섯 단계를 순서대로 돌아 조작마다 그만큼 멈췄다.
    상세만 기다림이 남는다: 다른 소스의 키(`keySurface`)는 트리가 그 소스를 확인한 뒤, 트리 이동의 첫 키(`FIRST_KEY`)는 목록 뒤다.
  */
  const prisma = getPrisma();
  const firstKey = parsed.key === FIRST_KEY;
  const { key: _selected, ...unselected } = parsed;
  const readDetail = (surface: { id: string } | undefined, key: string | undefined) =>
    key === undefined || surface === undefined ? null : loadTranslationDetail(prisma, { projectId, surfaceId: surface.id, keyId: key });
  const onRoute = parsed.keySurface === undefined || parsed.keySurface === surfaceSlug;
  const [project, tree, listed, unsentBySurface, early] = await Promise.all([
    loadProject(prisma, projectId, surfaceId),
    loadTranslationTree(prisma, projectId),
    firstKey || parsed.key === undefined
      ? loadTranslationList(prisma, { projectId, routeSurfaceId: surfaceId, query: unselected })
      : loadTranslationList(prisma, { projectId, routeSurfaceId: surfaceId, query: parsed, selectedKeyId: parsed.key }),
    countUnpublishedBySurface(prisma, projectId),
    !firstKey && onRoute ? readDetail({ id: surfaceId }, parsed.key) : null,
  ]);
  if (!project) redirect(routes.projects());
  const readiness = planProjectReadiness(project);
  if (readiness !== "ready") return <ProjectNotReady slug={slug} role={role} readiness={readiness} />;

  /*
    ⚠️ **트리 이동의 첫 키를 같은 렌더가 싣는다** (audit-ux #18) — 전엔 선택 없는 응답이 상세를 "Select a key"로 비웠고, 클라이언트
    effect가 첫 키로 `replace`를 한 번 더 했다. 다른 소스로 가면 화면이 새로 마운트되어 그 effect의 표식도 잃었다.
    주소의 예약값은 화면이 `history.replaceState`로 첫 키로 맞춘다.
  */
  const first = firstKey ? listed.rows[0] : undefined;
  const query = firstKey ? landOnFirstKey(parsed, first) : parsed;
  const list = first === undefined ? listed : { ...listed, selectedInResult: true };
  // 상세의 소스는 `keySurface`가 정한다(전체 범위의 다른 소스 결과) — 인가된 프로젝트의 활성 표면 안에서만 고른다.
  const detail = !firstKey && onRoute ? early
    : await readDetail(query.keySurface === undefined || query.keySurface === surfaceSlug ? { id: surfaceId } : tree.surfaces.find(s => s.slug === query.keySurface), query.key);
  const actors = detail?.status === "ok" ? await loadActors(prisma, detail.locales.flatMap(l => l.updatedBy === null ? [] : [l.updatedBy])) : new Map();
  const detailView = detail === null
    ? (query.key === undefined ? null : { absent: true as const, surfaceSlug: query.keySurface ?? surfaceSlug })
    : detail.status === "absent"
      ? { absent: true as const, surfaceSlug: query.keySurface ?? surfaceSlug }
      : (() => {
          const labeled = withActorLabels(detail, actors);
          // permalink는 서버가 만든다 — 그 판정이 사는 모듈(`lib/keys/view.ts`)은 어댑터를 물어 클라이언트가 읽으면 안 된다.
          return {
            key: labeled.key,
            locales: labeled.locales.map(({ code, isBase, value, needsReview, pending, actorLabel }) => ({ code, isBase, value, needsReview, pending, actorLabel })),
            refs: labeled.refs.map(ref => ({ ...ref, href: buildPermalink({ repoOwner: project.repoOwner, repoName: project.repoName, lastCommitSha: labeled.lastCommitSha }, ref) })),
          };
        })();

  return (
    <TranslationWorkspace
      slug={slug}
      routeSurfaceSlug={surfaceSlug}
      role={role}
      userId={userId}
      query={query}
      tree={tree}
      list={list}
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
    />
  );
}
