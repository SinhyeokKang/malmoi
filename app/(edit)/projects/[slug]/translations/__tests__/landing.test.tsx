import { beforeEach, expect, it, vi } from "vitest";
import type { KeyRow } from "@/lib/keys/view";

const state = vi.hoisted(() => ({ rows: [] as unknown[], redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }) }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("@/lib/surfaces/access", () => ({ requireSurfaceAccess: async () => ({ projectId: "p", surfaceId: "s", role: "EDITOR", archived: false }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/keys/query", () => ({
  loadProject: async () => ({ id: "p", surfaces: [{ id: "s", slug: "default", archivedAt: null, lastCommitSha: "sha", pathTemplate: "i18n/{locale}.json" }], slug: "demo", installationId: "1", lastCommitSha: "sha", baseLocale: "en", declaredBaseLocale: "en", lastPulledAt: null, lastPublishedAt: null, lastPrUrl: null, locales: [{ code: "en", isBase: true, orphaned: false }] }),
  loadKeys: async () => state.rows,
  loadActors: async () => ({}),
  countUnpublishedBySurface: async () => new Map(),
}));
vi.mock("@/components/translations/header", () => ({ TranslationsHeader: () => null }));
vi.mock("@/components/translations/key-group", () => ({ KeyGroup: () => null }));
vi.mock("@/components/project-archived", () => ({ ProjectArchived: () => null }));
vi.mock("@/components/project-not-ready", () => ({ ProjectNotReady: () => null }));
import Page from "../../surfaces/[surfaceSlug]/translations/page";

const row = (namespace: string, value: string): KeyRow => ({
  id: namespace, key: `${namespace}.title`, namespace, orphaned: false, createdAt: new Date(0), description: null, refs: [],
  cells: { en: { value, needsReview: false, updatedBy: null, updatedAt: new Date(0), surfaceArchivedAt: null, pending: false } },
});
beforeEach(() => { state.rows = [row("a", ""), row("b", "")]; state.redirect.mockClear(); });

it("preserves an explicit locale selection even when it covers this surface", async () => {
  const page = await Page({ params: Promise.resolve({ slug: "demo", surfaceSlug: "default" }), searchParams: Promise.resolve({ ns: "a", locales: "en" }) });
  expect(page.props.query.locales).toBe("en");
});

it("removes unavailable locale filters from the destination URL without losing valid filters", async () => {
  await expect(Page({ params: Promise.resolve({ slug: "demo", surfaceSlug: "default" }), searchParams: Promise.resolve({ ns: "a", locales: "en,ko", q: "title" }) }))
    .rejects.toThrow("redirect:/projects/demo/surfaces/default/translations?ns=a&locales=en&q=title");
});

it("기본 네임스페이스를 렌더 전에 URL에 고정한다", async () => {
  await expect(Page({ params: Promise.resolve({ slug: "demo", surfaceSlug: "default" }), searchParams: Promise.resolve({}) }))
    .rejects.toThrow("redirect:/projects/demo/surfaces/default/translations?ns=a");
});

it("다른 필터를 보존하고 저장 후에도 명시한 네임스페이스를 유지한다", async () => {
  await expect(Page({ params: Promise.resolve({ slug: "demo", surfaceSlug: "default" }), searchParams: Promise.resolve({ q: "title", locales: "en" }) }))
    .rejects.toThrow("redirect:/projects/demo/surfaces/default/translations?ns=a&locales=en&q=title");
  state.rows = [row("a", "Saved"), row("b", "")];
  state.redirect.mockClear();
  const page = await Page({ params: Promise.resolve({ slug: "demo", surfaceSlug: "default" }), searchParams: Promise.resolve({ ns: "a" }) });
  expect(page.props.query.ns).toBe("a");
  expect(state.redirect).not.toHaveBeenCalled();
});

it("전체 보기에는 기본 네임스페이스를 강제하지 않는다", async () => {
  const page = await Page({ params: Promise.resolve({ slug: "demo", surfaceSlug: "default" }), searchParams: Promise.resolve({ ns: "*" }) });
  expect(page.props.query.ns).toBe("*");
  expect(state.redirect).not.toHaveBeenCalled();
});
