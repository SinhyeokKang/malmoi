import { beforeEach, expect, it, vi } from "vitest";

/**
 * **번역 화면의 착지** (translation-rework T12 — design §3 옛 링크 · spec §3.2).
 *
 * - 옛 링크(`state=untranslated` · `locales` · `focus`)는 새 요청값으로 옮겨 **정규 주소로 redirect**한다 — 공유·새로고침이 같은 URL을 쓴다.
 * - `ns`가 없으면 전체다 — 옛 화면처럼 "남은 일이 있는 첫 네임스페이스"로 착지해 URL을 고정하지 않는다(POSTMORTEM 2026-09-15 — 0건 착지).
 * - 선택 키의 상세 소스는 `keySurface`가 정하고, 사라진 키는 다른 키로 바꾸지 않고 부재로 넘긴다.
 * ⚠️ 옛 표 화면의 착지 테스트(기본 네임스페이스 고정·로케일 선택 보존)를 대체한다 — 그 동작은 이 리워크가 걷어냈다.
 */
const state = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
  detail: vi.fn(),
  list: vi.fn(),
  tree: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("@/lib/surfaces/access", () => ({ requireSurfaceAccess: async () => ({ projectId: "p", surfaceId: "s", role: "EDITOR", archived: false, userId: "u" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/keys/query", () => ({
  loadProject: async () => ({ id: "p", name: "Demo", surfaces: [{ id: "s", slug: "default", archivedAt: null, lastCommitSha: "sha", pathTemplate: "i18n/{locale}.json" }], slug: "demo", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1", lastCommitSha: "sha", baseLocale: "en", declaredBaseLocale: "en", lastPulledAt: null, lastPublishedAt: null, lastPrUrl: null, locales: [] }),
  loadActors: async () => new Map(),
  countUnpublishedBySurface: async () => new Map([["s", 2]]),
}));
vi.mock("@/lib/keys/translation-list", () => ({
  loadTranslationTree: state.tree,
  loadTranslationList: state.list,
  loadTranslationDetail: state.detail,
  withActorLabels: (detail: { locales: object[] }) => ({ ...detail, locales: detail.locales.map(l => ({ ...l, actorLabel: null })) }),
}));
vi.mock("@/components/translations/workspace/workspace", () => ({ TranslationWorkspace: () => null }));
vi.mock("@/components/project-archived", () => ({ ProjectArchived: () => null }));
vi.mock("@/components/project-not-ready", () => ({ ProjectNotReady: () => null }));
import Page from "../../surfaces/[surfaceSlug]/translations/page";

const TREE = { projectKeyCount: 1, surfaces: [
  { id: "s", slug: "default", baseLocale: "en", locales: ["en"], keyCount: 1, namespaces: [] },
  { id: "s2", slug: "app", baseLocale: "en", locales: ["en"], keyCount: 0, namespaces: [] },
] };
const ROW = { keyId: "k7", surfaceSlug: "app", namespace: "auth", key: "auth.title", sourceText: "Sign in", missingCount: 0, totalLocales: 1, hasPending: false, hasReview: false, isNew: false };

const render = (searchParams: Record<string, string>) =>
  Page({ params: Promise.resolve({ slug: "demo", surfaceSlug: "default" }), searchParams: Promise.resolve(searchParams) });

beforeEach(() => {
  state.redirect.mockClear();
  state.list.mockResolvedValue({ rows: [], matchedKeyCount: 0, incompleteKeyCount: 0, nextCursor: null, effective: { completion: "all", substituted: false, excludedSurfaceIds: [] }, selectedInResult: null });
  state.detail.mockReset();
  state.tree.mockResolvedValue(TREE);
});

it("옛 state=untranslated는 completion=incomplete로 옮겨 정규 주소로 보낸다", async () => {
  await expect(render({ state: "untranslated", ns: "*" })).rejects.toThrow("redirect:/projects/demo/surfaces/default/translations?completion=incomplete");
});

it("옛 locales 하나는 상세 언어로, focus는 버리고 보낸다", async () => {
  await expect(render({ locales: "ko", focus: "ja", q: "title" })).rejects.toThrow("redirect:/projects/demo/surfaces/default/translations?q=title&language=ko");
});

it("ns가 없으면 전체다 — 기본 네임스페이스로 URL을 고정하지 않는다", async () => {
  const page = await render({ state: "review" });
  expect(state.redirect).not.toHaveBeenCalled();
  expect(page.props.query).toMatchObject({ ns: "*", scope: "source", state: "review" });
});

it("미전달 수는 표면별 합이다", async () => {
  expect((await render({})).props.unpublished).toBe(2);
});

it("keySurface가 상세의 소스를 정한다 — 인가된 프로젝트의 활성 표면 안에서만", async () => {
  state.detail.mockResolvedValue({ status: "absent" });
  await render({ key: "k1", keySurface: "app" });
  expect(state.detail).toHaveBeenCalledWith({}, { projectId: "p", surfaceId: "s2", keyId: "k1" });
});

it("사라진 키는 부재로 넘긴다 — 다른 키를 자동으로 고르지 않는다", async () => {
  state.detail.mockResolvedValue({ status: "absent" });
  const page = await render({ key: "gone" });
  expect(page.props.detail).toEqual({ absent: true, surfaceSlug: "default" });
});

it("모르는 keySurface는 상세를 읽지 않고 부재다 — 다른 프로젝트의 소스로 넓히지 않는다", async () => {
  const page = await render({ key: "k1", keySurface: "elsewhere" });
  expect(state.detail).not.toHaveBeenCalled();
  expect(page.props.detail).toEqual({ absent: true, surfaceSlug: "elsewhere" });
});

it("선택 키가 있으면 목록 조회가 그 키의 결과 포함 여부를 함께 잰다", async () => {
  state.detail.mockResolvedValue({ status: "absent" });
  await render({ key: "k1", completion: "incomplete" });
  expect(state.list).toHaveBeenCalledWith({}, expect.objectContaining({ selectedKeyId: "k1" }));
});

it("옛 cursor는 버리고 정규 주소로 보낸다 — 새로고침·공유가 중간 페이지부터 시작하지 않는다 (audit-ux #19)", async () => {
  await expect(render({ ns: "auth", scope: "namespace", cursor: "c1" })).rejects.toThrow("redirect:/projects/demo/surfaces/default/translations?ns=auth&scope=namespace");
});

/*
  ⚠️ **트리 이동의 첫 키는 같은 렌더가 싣는다** (audit-ux #18) — 전엔 선택 없는 응답이 상세를 "Select a key"로 비웠다가
  클라이언트 effect가 첫 키로 `replace`를 한 번 더 했다. 소스를 바꾸면 화면이 새로 마운트되어 그 effect의 표식도 잃었다.
*/
it("key=@first는 목록의 첫 행을 선택으로 싣고 그 상세를 같은 응답에 담는다", async () => {
  state.list.mockResolvedValue({ rows: [ROW], matchedKeyCount: 1, incompleteKeyCount: 0, nextCursor: null, effective: { completion: "all", substituted: false, excludedSurfaceIds: [] }, selectedInResult: null });
  state.detail.mockResolvedValue({ status: "ok", key: { id: "k7", key: "auth.title", namespace: "auth", sourceText: "Sign in", description: null, surfaceSlug: "app" }, lastCommitSha: null, refs: [], locales: [] });
  const page = await render({ ns: "auth", scope: "namespace", key: "@first" });
  expect(state.redirect).not.toHaveBeenCalled();
  // 목록은 선택 없이 읽는다 — 예약값을 키 id로 재지 않는다.
  expect(state.list).toHaveBeenCalledWith({}, expect.not.objectContaining({ selectedKeyId: expect.anything() }));
  expect(state.detail).toHaveBeenCalledExactlyOnceWith({}, { projectId: "p", surfaceId: "s2", keyId: "k7" });
  expect(page.props.query).toMatchObject({ ns: "auth", scope: "namespace", key: "k7", keySurface: "app" });
  expect(page.props.list.selectedInResult).toBe(true);
  expect(page.props.detail).toMatchObject({ key: { id: "k7" } });
});

it("key=@first인데 행이 없으면 선택 없는 빈 상세다 — 예약값이 키로 새지 않는다", async () => {
  const page = await render({ ns: "auth", scope: "namespace", key: "@first" });
  expect(state.detail).not.toHaveBeenCalled();
  expect(page.props.query.key).toBeUndefined();
  expect(page.props.detail).toBeNull();
});

it("트리와 목록은 서로를 기다리지 않는다 — 트리가 늦어도 목록 조회는 이미 떠났다 (audit-ux #7)", async () => {
  let release = () => {};
  state.list.mockClear();
  state.tree.mockReturnValue(new Promise(resolve => { release = () => resolve(TREE); }));
  const pending = render({});
  await vi.waitFor(() => expect(state.list).toHaveBeenCalledOnce());
  release();
  await pending;
});
