import type { WorkspaceProps } from "@/components/translations/workspace/workspace";
import { DEFAULT_TRANSLATION_QUERY } from "@/lib/translations/query";

/** 번역 작업 화면의 기본 props — 작업 화면 테스트와 Publish 호스트 테스트가 같은 화면을 렌더한다. */
export function props(over: Partial<WorkspaceProps> = {}): WorkspaceProps {
  return {
    slug: "acme", routeSurfaceSlug: "web", role: "OWNER", userId: "u1",
    query: { ...DEFAULT_TRANSLATION_QUERY, key: "k1", keySurface: "web" },
    tree: { projectKeyCount: 2, surfaces: [{ id: "s1", slug: "web", baseLocale: "en", locales: ["en", "ko", "zh"], keyCount: 2, namespaces: [{ name: "common", keyCount: 2 }] }] },
    list: {
      rows: [
        { keyId: "k1", surfaceSlug: "web", namespace: "common", key: "common.empty", sourceText: "Nothing here", missingCount: 1, totalLocales: 3, hasPending: true, hasReview: false, isNew: false },
        { keyId: "k2", surfaceSlug: "web", namespace: "common", key: "common.save", sourceText: "Save", missingCount: 0, totalLocales: 3, hasPending: false, hasReview: false, isNew: false },
      ],
      matchedKeyCount: 2, incompleteKeyCount: 1, nextCursor: null,
      effective: { completion: "all", substituted: false, excludedSurfaceIds: [] }, selectedInResult: true,
    },
    detail: {
      key: { id: "k1", key: "common.empty", namespace: "common", sourceText: "Nothing here", description: "Shown on the empty list.", surfaceSlug: "web" },
      refs: [{ path: "src/empty.tsx", line: 24, href: "https://github.com/o/r/blob/abc/src/empty.tsx#L24" }],
      locales: [
        { code: "en", isBase: true, value: "Nothing here", needsReview: false, pending: false, actorLabel: null },
        { code: "ko", isBase: false, value: "비어 있음", needsReview: false, pending: true, actorLabel: "Editor" },
        { code: "zh", isBase: false, value: null, needsReview: false, pending: false, actorLabel: null },
      ],
    },
    unpublished: 1,
    publish: { repo: { owner: "o", name: "r", branch: "main", syncBranch: "malmoi-i18n/sync-acme" }, lastSentLabel: null, lastPrUrl: null },
    sync: { name: "acme", branch: "main" },
    baseLocale: "en", declaredBaseLocale: null,
    ...over,
  };
}
