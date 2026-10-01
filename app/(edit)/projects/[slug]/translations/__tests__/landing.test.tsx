import { beforeEach, expect, it, vi } from "vitest";

/**
 * **번역 화면의 착지** (translation-rework T12 · translation-tree-range T4 — design §3).
 *
 * - 화면 요청값은 `screenQuery(raw)`다 — 옛 주소(`Untranslated in`·`Complete`·검색어 없는 `scope`·cursor·`locales`·`focus`)는 **정규 주소로 redirect**한다.
 *   정규 주소는 redirect하지 않는다(루프 없음).
 * - 목록은 **늘 전 소스로 한 번 읽고** 범위(트리 위치 · 전 소스 검색)로 자른다. 트리 숫자(`counts`)는 같은 전 소스 행에서 센다.
 * - 검색어 없이 다른 소스의 키를 가리키는 옛 링크는 그 키의 소스·네임스페이스로 옮긴다. 사라진 키는 다른 키로 바꾸지 않고 부재로 넘긴다.
 * - `ns`가 없으면 전체다 — "남은 일이 있는 첫 네임스페이스"로 착지하지 않는다(POSTMORTEM 2026-09-15 — 0건 착지).
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

// 트리 순서(slug)다 — 경로 소스는 `default`(id `s`), 다른 활성 소스는 `app`(id `s2`).
const TREE = { projectKeyCount: 4, surfaces: [
  { id: "s2", slug: "app", baseLocale: "en", locales: ["en", "ja"], keyCount: 1, namespaces: [{ name: "common", keyCount: 1 }] },
  { id: "s", slug: "default", baseLocale: "en", locales: ["en", "ko"], keyCount: 3, namespaces: [{ name: "auth", keyCount: 2 }, { name: "checkout", keyCount: 1 }] },
] };
const at = (keyId: string, surfaceSlug: string, namespace: string) => ({ keyId, surfaceSlug, namespace, key: `${namespace}.${keyId}`, sourceText: keyId, missingCount: keyId.endsWith("i") ? 1 : 0, totalLocales: 2, hasPending: false, hasReview: false, isNew: false });
// 전 소스 목록 — 정렬상 다른 소스의 행이 앞에 있다.
const ROWS = [at("a1", "app", "common"), at("k2i", "default", "checkout"), at("k7", "default", "auth"), at("k9", "default", "auth")];
const listOf = (rows: object[], selectedInResult: boolean | null = null) => ({ rows, matchedKeyCount: rows.length, incompleteKeyCount: 0, nextCursor: null, effective: { completion: "all", substituted: false, excludedSurfaceIds: [] }, selectedInResult });
const ok = (id: string, surfaceSlug: string, namespace: string) => ({ status: "ok", key: { id, key: `${namespace}.${id}`, namespace, sourceText: id, description: null, surfaceSlug }, lastCommitSha: null, refs: [], locales: [] });
const SURFACE_OF: Record<string, string> = { s: "default", s2: "app" };
const KEYS: Record<string, [surfaceSlug: string, namespace: string]> = { a1: ["app", "common"], k2i: ["default", "checkout"], k7: ["default", "auth"], k9: ["default", "auth"], c3: ["default", "checkout"], w9: ["app", "common"] };

const render = (searchParams: Record<string, string | undefined>) =>
  Page({ params: Promise.resolve({ slug: "demo", surfaceSlug: "default" }), searchParams: Promise.resolve(searchParams) });
const redirected = async (searchParams: Record<string, string | undefined>) => {
  await expect(render(searchParams)).rejects.toThrow(/^redirect:/);
  return state.redirect.mock.calls.at(-1)![0] as string;
};
const listQuery = () => (state.list.mock.calls.at(-1)![1] as { query: { scope: string } }).query;

beforeEach(() => {
  state.redirect.mockClear();
  state.list.mockReset();
  state.list.mockResolvedValue(listOf(ROWS));
  state.detail.mockReset();
  // 인가된 활성 표면 안에서 그 키가 있으면 상세, 없으면 부재다.
  state.detail.mockImplementation(async (_prisma: unknown, input: { surfaceId: string; keyId: string }) => {
    const found = Object.hasOwn(KEYS, input.keyId) ? KEYS[input.keyId] : undefined;
    return found !== undefined && found[0] === SURFACE_OF[input.surfaceId] ? ok(input.keyId, found[0], found[1]) : { status: "absent" };
  });
  state.tree.mockReset();
  state.tree.mockResolvedValue(TREE);
});

// ── 옛 주소 → 정규 주소 (조건 11) ────────────────────────────────────────────────

it("옛 state=untranslated는 Incomplete로 옮겨 정규 주소로 보낸다", async () => {
  expect(await redirected({ state: "untranslated", ns: "*" })).toBe("/projects/demo/surfaces/default/translations?completion=incomplete");
});

it("옛 locales 하나는 상세 언어로, focus는 버리고 보낸다", async () => {
  expect(await redirected({ locales: "ko", focus: "ja", q: "title" })).toBe("/projects/demo/surfaces/default/translations?q=title&language=ko");
});

it.each([
  [{ completion: "missing", missingLocale: "ko" }, "?completion=incomplete&language=ko"],
  [{ completion: "missing" }, "?completion=incomplete"],
  [{ missingLocale: "ko" }, ""],
  [{ completion: "complete" }, ""],
  [{ scope: "project" }, ""],
  [{ scope: "namespace", ns: "auth" }, "?ns=auth"],
  [{ completion: "incomplete", state: "review" }, "?state=review"],
  [{ ns: "auth", scope: "namespace", cursor: "c1" }, "?ns=auth"],
  [{ ns: "auth", cursor: "c1" }, "?ns=auth"],
  [{ q: "x", scope: "project" }, "?q=x"],
])("옛 주소 %o → 정규 주소 %s", async (raw, search) => {
  expect(await redirected(raw)).toBe(`/projects/demo/surfaces/default/translations${search}`);
});

it("검색어 없이 다른 소스의 키를 고른 옛 주소는 그 키의 소스·네임스페이스로 옮긴다 — default/checkout → app/common", async () => {
  expect(await redirected({ ns: "checkout", key: "a1", keySurface: "app" })).toBe("/projects/demo/surfaces/app/translations?ns=common&key=a1&keySurface=app");
  expect(state.detail).toHaveBeenCalledWith({}, { projectId: "p", surfaceId: "s2", keyId: "a1" });
});

it("같은 소스의 옛 키 링크도 선택 키가 네임스페이스 범위 밖이면 그 키의 네임스페이스로 맞춘다 — ns=*는 범위 안이라 그대로다", async () => {
  expect(await redirected({ ns: "auth", key: "c3", keySurface: "default" })).toBe("/projects/demo/surfaces/default/translations?ns=checkout&key=c3&keySurface=default");
  state.redirect.mockClear();
  const page = await render({ key: "c3", keySurface: "default" });
  expect(state.redirect).not.toHaveBeenCalled();
  expect(page.props.query).toMatchObject({ ns: "*", key: "c3" });
});

it("다른 소스의 사라진 키는 네임스페이스를 추측하지 않는다 — 소스만 옮기고 부재로 넘긴다", async () => {
  expect(await redirected({ ns: "checkout", key: "gone", keySurface: "app" })).toBe("/projects/demo/surfaces/app/translations?ns=checkout&key=gone&keySurface=app");
});

it("모르는·보관된 keySurface는 버린다 — 상세를 읽지 않고 다른 프로젝트의 소스로 넓히지 않는다", async () => {
  expect(await redirected({ key: "k1", keySurface: "elsewhere" })).toBe("/projects/demo/surfaces/default/translations?key=k1");
  expect(state.detail).not.toHaveBeenCalled();
});

it("Home 상태 링크의 ns=*는 생략과 같다 — redirect 왕복을 더하지 않는다", async () => {
  for (const raw of [{ ns: "*", state: "new" }, { ns: "*", completion: "incomplete", language: "ko" }]) {
    await render(raw);
    expect(state.redirect, JSON.stringify(raw)).not.toHaveBeenCalled();
  }
});

it.each([
  [{ q: "x" }], [{ q: "x", scope: "source" }], [{ q: "x", scope: "namespace", ns: "auth" }], [{ ns: "auth" }], [{ state: "review" }],
  [{ state: "review", q: "x" }], [{ completion: "incomplete", language: "@missing" }], [{ key: "k7", keySurface: "default", ns: "auth" }],
])("정규 주소 %o는 redirect 없이 렌더한다 — 루프 없음", async (raw) => {
  await render(raw);
  expect(state.redirect).not.toHaveBeenCalled();
});

// ── 상세 언어 (조건 12) ──────────────────────────────────────────────────────────

it("상세 대상 소스에 없는 언어는 정규 주소에서 지운다 — 없음·@missing은 보존한다", async () => {
  expect(await redirected({ completion: "incomplete", language: "ja" })).toBe("/projects/demo/surfaces/default/translations?completion=incomplete");
  for (const raw of [{}, { language: "@missing" }, { language: "ko" }]) {
    const page = await render(raw);
    expect(page.props.query.language).toBe(raw.language);
  }
  expect(state.redirect).toHaveBeenCalledOnce();
});

it("언어는 상세 대상 소스로 잰다 — 다른 소스의 키(전 소스 검색)와 소스를 옮기는 옛 링크는 그 소스 기준이다", async () => {
  const page = await render({ q: "x", key: "a1", keySurface: "app", language: "ja" });
  expect(state.redirect).not.toHaveBeenCalled();
  expect(page.props.query.language).toBe("ja");
  const target = await redirected({ ns: "checkout", key: "a1", keySurface: "app", language: "ja" });
  expect(target).toBe("/projects/demo/surfaces/app/translations?ns=common&key=a1&keySurface=app&language=ja");
});

// ── 늘 전 소스로 읽고 범위로 자른다 (조건 1·9) ─────────────────────────────────────

it("목록은 조건과 무관하게 늘 전 소스(scope project)·전량으로 읽는다", async () => {
  for (const raw of [{}, { ns: "auth" }, { q: "x" }, { q: "x", scope: "namespace", ns: "auth" }, { state: "review" }]) {
    await render(raw);
    expect(listQuery().scope, JSON.stringify(raw)).toBe("project");
    expect((state.list.mock.calls.at(-1)![1] as { pageSize: unknown }).pageSize).toBe("all");
  }
});

it("화면 목록은 범위의 행뿐이고, 수·선택 포함 여부를 자른 행에서 다시 센다", async () => {
  state.list.mockResolvedValue(listOf(ROWS, true));
  const page = await render({ ns: "auth", key: "a1", keySurface: "default" });
  expect(page.props.list.rows.map((r: { keyId: string }) => r.keyId)).toEqual(["k7", "k9"]);
  expect(page.props.list.matchedKeyCount).toBe(2);
  // 로더는 전 소스 결과라 a1이 있다고 하지만, 범위(default/auth)에는 없다.
  expect(page.props.list.selectedInResult).toBe(false);
});

it("전 소스 검색은 모든 활성 소스의 행이고, 위치로 좁힌 검색은 그 노드의 행이다", async () => {
  expect((await render({ q: "x" })).props.list.rows).toHaveLength(4);
  expect((await render({ q: "x", scope: "source" })).props.list.rows.map((r: { keyId: string }) => r.keyId)).toEqual(["k2i", "k7", "k9"]);
  const narrowed = await render({ q: "x", scope: "namespace", ns: "checkout" });
  expect(narrowed.props.list.rows.map((r: { keyId: string }) => r.keyId)).toEqual(["k2i"]);
  expect(narrowed.props.list.incompleteKeyCount).toBe(1);
});

it("조건이 있을 때만 트리 숫자(counts)를 전 소스 행에서 센다", async () => {
  expect((await render({ ns: "auth" })).props.counts).toBeNull();
  const counted = (await render({ state: "review", ns: "auth" })).props.counts as { surfaceSlug: string; namespace: string; count: number }[];
  expect(counted.reduce((sum, c) => sum + c.count, 0)).toBe(ROWS.length);
  expect(counted).toContainEqual({ surfaceSlug: "app", namespace: "common", count: 1 });
});

// ── 선택 · 첫 키 ────────────────────────────────────────────────────────────────

it("미전달 수는 표면별 합이다", async () => {
  expect((await render({})).props.unpublished).toBe(2);
});

it("전 소스 검색의 keySurface가 상세의 소스를 정한다 — 인가된 프로젝트의 활성 표면 안에서만", async () => {
  await render({ q: "x", key: "a1", keySurface: "app" });
  expect(state.detail).toHaveBeenCalledWith({}, { projectId: "p", surfaceId: "s2", keyId: "a1" });
});

it("사라진 키는 부재로 넘긴다 — 다른 키를 자동으로 고르지 않는다", async () => {
  const page = await render({ key: "gone" });
  expect(page.props.detail).toEqual({ absent: true, surfaceSlug: "default" });
});

it("선택 키가 있으면 목록 조회가 그 키의 결과 포함 여부를 함께 잰다", async () => {
  await render({ key: "k7", ns: "auth", completion: "incomplete" });
  expect(state.list).toHaveBeenCalledWith({}, expect.objectContaining({ selectedKeyId: "k7" }));
});

/*
  ⚠️ **트리 이동의 첫 키는 같은 렌더가 싣는다** (audit-ux #18) — 전엔 선택 없는 응답이 상세를 "Select a key"로 비웠다가
  클라이언트 effect가 첫 키로 `replace`를 한 번 더 했다.
*/
it("key=@first는 범위로 자른 행의 첫 키를 선택으로 싣고 그 상세를 같은 응답에 담는다", async () => {
  const page = await render({ ns: "auth", key: "@first" });
  expect(state.redirect).not.toHaveBeenCalled();
  // 목록은 선택 없이 읽는다 — 예약값을 키 id로 재지 않는다.
  expect(state.list).toHaveBeenCalledWith({}, expect.not.objectContaining({ selectedKeyId: expect.anything() }));
  expect(state.detail).toHaveBeenCalledExactlyOnceWith({}, { projectId: "p", surfaceId: "s", keyId: "k7" });
  expect(page.props.query).toMatchObject({ ns: "auth", scope: "namespace", key: "k7", keySurface: "default" });
  expect(page.props.list.selectedInResult).toBe(true);
  expect(page.props.detail).toMatchObject({ key: { id: "k7" } });
});

it("key=@first + ns=*는 경로 소스의 첫 행이다 — 앞선 다른 소스의 행을 고르지 않는다", async () => {
  expect((await render({ key: "@first" })).props.query).toMatchObject({ key: "k2i", keySurface: "default" });
});

it("검색 중 노드의 @first는 그 노드의 첫 일치 키다", async () => {
  expect((await render({ q: "x", scope: "namespace", ns: "auth", key: "@first" })).props.query).toMatchObject({ ns: "auth", key: "k7" });
});

it("key=@first인데 범위에 키가 없으면 선택 없음이다 — 예약값이 키로 새지 않는다", async () => {
  state.list.mockResolvedValue(listOf([at("a1", "app", "common"), at("k2i", "default", "checkout")]));
  const page = await render({ ns: "auth", key: "@first" });
  expect(state.detail).not.toHaveBeenCalled();
  expect(page.props.query.key).toBeUndefined();
  expect(page.props.list.selectedInResult).toBeNull();
  expect(page.props.detail).toBeNull();
});

it("트리와 목록은 서로를 기다리지 않는다 — 트리가 늦어도 목록 조회는 이미 떠났다 (audit-ux #7)", async () => {
  let release = () => {};
  state.tree.mockReturnValue(new Promise(resolve => { release = () => resolve(TREE); }));
  const pending = render({});
  await vi.waitFor(() => expect(state.list).toHaveBeenCalledOnce());
  release();
  await pending;
});
