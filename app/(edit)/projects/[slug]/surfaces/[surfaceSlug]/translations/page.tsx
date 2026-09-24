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
import { parseTranslationQuery, serializeTranslationQuery } from "@/lib/translations/query";

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

  const prisma = getPrisma();
  const project = await loadProject(prisma, projectId, surfaceId);
  if (!project) redirect(routes.projects());
  const readiness = planProjectReadiness(project);
  if (readiness !== "ready") return <ProjectNotReady slug={slug} role={role} readiness={readiness} />;

  // 옛 링크(`state=untranslated` · `locales` · `focus`)는 새 요청값으로 옮겨 정규 주소로 보낸다 — 공유·새로고침이 같은 URL을 쓴다.
  const query = parseTranslationQuery(raw);
  const legacy = raw.locales !== undefined || raw.focus !== undefined || raw.state === "untranslated";
  if (legacy) redirect(routes.surfaceTranslations(slug, surfaceSlug, serializeTranslationQuery(query)));

  const tree = await loadTranslationTree(prisma, projectId);
  // 상세의 소스는 `keySurface`가 정한다(전체 범위의 다른 소스 결과) — 인가된 프로젝트의 활성 표면 안에서만 고른다.
  const detailSurface = query.keySurface === undefined ? { id: surfaceId, slug: surfaceSlug } : tree.surfaces.find(s => s.slug === query.keySurface);

  const [list, detail, unsentBySurface] = await Promise.all([
    loadTranslationList(prisma, { projectId, routeSurfaceId: surfaceId, query, ...(query.key === undefined ? {} : { selectedKeyId: query.key }) }),
    query.key === undefined || detailSurface === undefined ? null : loadTranslationDetail(prisma, { projectId, surfaceId: detailSurface.id, keyId: query.key }),
    countUnpublishedBySurface(prisma, projectId),
  ]);
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
