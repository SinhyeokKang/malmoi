import { describe, expect, it } from "vitest";
import {
  INBOX_KIND_FILTERS, effectiveInboxFilter, filterInbox, hasNarrowing,
  inboxFilterOptions, inboxKindOf, inboxQuery, parseInboxFilter,
  type InboxFilter, type InboxKindFilter,
} from "../filter";
import { planInbox, type InboxItem, type InboxPlan, type InboxProject } from "../plan";

const at = new Date("2026-10-18T00:00:00.000Z");
const fixtures = {
  unsent: { item: { kind: "unsent", at, surfaceSlug: "web", count: 2 }, expected: "publish" },
  language_unsent: { item: { kind: "language_unsent", at, surfaceSlug: "web", count: 1, held: false }, expected: "publish" },
  review: { item: { kind: "review", at, surfaceSlug: "web", code: "ja", name: "Japanese", count: 3, who: "Actor" }, expected: "review" },
  never_filled: { item: { kind: "never_filled", at, surfaceSlug: "docs", code: "es", name: "Spanish", keys: 4 }, expected: "untranslated" },
  import_failed: { item: { kind: "import_failed", at: null, surfaceSlug: "catalog", reason: "parse-failed" }, expected: "sync_failed" },
  needs_reconnect: { item: { kind: "needs_reconnect", at: null }, expected: "disconnected" },
  setup: { item: { kind: "setup", at }, expected: "setup" },
} satisfies { [K in InboxItem["kind"]]: { item: Extract<InboxItem, { kind: K }>; expected: InboxKindFilter } };
const partial: InboxItem = { kind: "import_failed", at, surfaceSlug: "partial-catalog", reason: "partial-import" };
const empty: InboxFilter = { kind: null, projects: [], q: null };
const allItems: InboxItem[] = [...Object.values(fixtures).map(fixture => fixture.item), partial];

function group(slug: string, items: readonly InboxItem[], name = slug): InboxPlan["groups"][number] {
  return {
    project: { slug, name, image: null, reconnect: "settings" },
    items: items.map(item => ({ ...item, unread: item.kind !== "review", ownerRetries: false })),
  };
}
function plan(...groups: InboxPlan["groups"]): InboxPlan {
  return { groups, unread: groups.reduce((n, group) => n + group.items.filter(item => item.unread).length, 0) };
}
function narrowed(input: InboxPlan, patch: Partial<InboxFilter>): InboxPlan {
  return filterInbox(input, { ...empty, ...patch });
}

describe("Inbox URL", () => {
  it("빈 파라미터는 좁히지 않는다", () => {
    expect(parseInboxFilter({})).toEqual(empty);
    expect(inboxQuery(empty)).toEqual({});
    expect(hasNarrowing(empty)).toBe(false);
  });
  it("반복 파라미터는 축마다 첫 값만 쓴다", () => {
    expect(parseInboxFilter({ kind: ["review", "setup"], project: ["b,a", "c"], q: [" ja ", "es"] }))
      .toEqual({ kind: "review", projects: ["a", "b"], q: "ja" });
    expect(parseInboxFilter({ kind: [], project: [], q: [] })).toEqual(empty);
  });
  it.each(["", "unknown", "__proto__", "constructor", "toString", "REVIEW"])("알 수 없는 종류 %s는 무시한다", kind => {
    expect(parseInboxFilter({ kind }).kind).toBeNull();
  });
  it.each(["publish", "review", "untranslated", "sync_failed", "partial", "disconnected", "setup"])("종류 %s를 받는다", kind => {
    expect(parseInboxFilter({ kind: ` ${kind} ` }).kind).toBe(kind);
  });
  it("프로젝트 목록은 trim·빈 항목 제거·중복 제거·정렬하고 대소문자는 구별한다", () => {
    expect(parseInboxFilter({ project: " z, ,a,Z,z,a,,__proto__,constructor " }).projects)
      .toEqual(["Z", "__proto__", "a", "constructor", "z"]);
  });
  it("목록 전체를 글자 수로 자르지 않고 항목 50개로 제한한다", () => {
    const projects = Array.from({ length: 51 }, (_, i) => `project-${String(i).padStart(2, "0")}-${"x".repeat(30)}`);
    expect(parseInboxFilter({ project: projects.join(",") }).projects).toEqual(projects.slice(0, 50));
    expect(parseInboxFilter({ project: "a".repeat(201) }).projects).toEqual(["a".repeat(200)]);
  });
  it.each(["", "  \t\n "])("빈 검색어 %s는 null이다", q => {
    expect(parseInboxFilter({ q }).q).toBeNull();
  });
  it("검색어는 trim·200자 상한·내부 공백 정규화를 따른다", () => {
    expect(parseInboxFilter({ q: ` ${"a".repeat(201)} ` }).q).toBe("a".repeat(200));
    expect(parseInboxFilter({ q: "  Web \t\n App  " }).q).toBe("Web App");
  });
  it("URL 조립은 프로젝트 중복과 순서에 무관하고 파싱과 왕복한다", () => {
    const filter: InboxFilter = { kind: "publish", projects: ["web", "docs", "web"], q: "Japanese" };
    const query = inboxQuery(filter);
    expect(query).toEqual({ kind: "publish", project: "docs,web", q: "Japanese" });
    expect(parseInboxFilter(query)).toEqual({ ...filter, projects: ["docs", "web"] });
    expect(inboxQuery(parseInboxFilter(query))).toEqual(query);
  });
});

describe("종류와 실효 필터", () => {
  it.each([...Object.values(fixtures), { item: partial, expected: "partial" as const }])("$item.kind → $expected", ({ item, expected }) => {
    expect(inboxKindOf(item)).toBe(expected);
  });
  it("선택지 종류는 정해진 순서이고 중복 없이 원래 계획에 있는 값만 남는다", () => {
    expect(INBOX_KIND_FILTERS).toEqual(["publish", "review", "untranslated", "sync_failed", "partial", "disconnected", "setup"]);
    const input = plan(group("z", [...allItems].reverse()), group("a", [fixtures.review.item]));
    expect(inboxFilterOptions(input)).toEqual({ kinds: INBOX_KIND_FILTERS, projects: input.groups.map(group => group.project) });
    expect(inboxFilterOptions(plan(group("a", [fixtures.language_unsent.item, fixtures.review.item]))).kinds).toEqual(["publish", "review"]);
    expect(inboxFilterOptions(plan())).toEqual({ kinds: [], projects: [] });
  });
  it.each([{ project: "gone" }, { kind: "setup" }])("계획에서 사라진 값 %j는 좁힘으로 세지 않는다", params => {
    const options = inboxFilterOptions(plan(group("web", [fixtures.review.item])));
    const filter = effectiveInboxFilter(parseInboxFilter(params), options);
    expect(filter).toEqual(empty);
    expect(hasNarrowing(filter)).toBe(false);
  });
  it("실효 프로젝트는 정확 일치로만 남고 프로토타입 이름도 실제 선택지일 때만 받는다", () => {
    const options = inboxFilterOptions(plan(group("web", [fixtures.review.item]), group("__proto__", [fixtures.review.item])));
    expect(effectiveInboxFilter({ kind: "review", projects: ["WEB", "web", "__proto__", "constructor"], q: "ja" }, options))
      .toEqual({ kind: "review", projects: ["web", "__proto__"], q: "ja" });
  });
  it.each([{ kind: "review" as const }, { projects: ["web"] }, { q: "ja" }])("유효한 축 %j는 좁힘이다", patch => {
    expect(hasNarrowing({ ...empty, ...patch })).toBe(true);
  });
});

describe("Inbox 계획 거르기", () => {
  const input = plan(group("z", allItems, "Web App"), group("a", [fixtures.review.item], "Documentation"));
  it("좁힘이 없으면 묶음·항목·메타데이터를 그대로 보존한다", () => {
    expect(filterInbox(input, empty)).toEqual(input);
  });
  it("프로젝트 다중 선택은 정확 일치하고 빈 묶음은 빠진다", () => {
    expect(narrowed(input, { projects: ["a"] }).groups).toEqual([input.groups[1]]);
    expect(narrowed(input, { projects: ["A", "gone"] })).toEqual(plan());
    expect(narrowed(input, { projects: ["a", "z"] })).toEqual(input);
  });
  it("publish는 같은 프로젝트의 값과 언어 미발송을 함께 남긴다", () => {
    const result = narrowed(input, { kind: "publish" });
    expect(result.groups.map(group => group.project.slug)).toEqual(["z"]);
    expect(result.groups[0]?.items.map(item => item.kind)).toEqual(["unsent", "language_unsent"]);
    expect(result.unread).toBe(2);
  });
  it.each([
    ["review", ["review"], 2], ["untranslated", ["never_filled"], 1],
    ["sync_failed", ["import_failed"], 1], ["partial", ["import_failed"], 1],
    ["disconnected", ["needs_reconnect"], 1], ["setup", ["setup"], 1],
  ] as const)("종류 %s는 해당 항목만 남긴다", (kind, kinds, groups) => {
    const result = narrowed(input, { kind });
    expect(result.groups).toHaveLength(groups);
    for (const group of result.groups) expect(group.items.map(item => item.kind)).toEqual(kinds);
    if (kind === "partial" || kind === "sync_failed") {
      expect(result.groups[0]?.items[0]).toMatchObject({ reason: kind === "partial" ? "partial-import" : "parse-failed" });
    }
  });
  it("프로젝트·종류·검색은 AND로 좁힌다", () => {
    expect(narrowed(input, { projects: ["a"], kind: "review", q: "ja" }).groups).toEqual([input.groups[1]]);
    expect(narrowed(input, { projects: ["a"], kind: "publish", q: "ja" })).toEqual(plan());
  });
  it("남은 묶음과 항목은 원래 순서이며 unread는 남은 항목으로 다시 센다", () => {
    const result = narrowed(input, { q: "web" });
    expect(result.groups.map(group => group.project.slug)).toEqual(["z", "a"]);
    expect(result.groups[0]?.items).toEqual(input.groups[0]?.items);
    expect(result.unread).toBe(7);
    expect(narrowed(input, { kind: "review" }).unread).toBe(0);
    expect(narrowed(input, { kind: "publish" }).unread).toBe(2);
  });
  it("원래 계획·필터·항목을 바꾸지 않고 같은 입력에 같은 결과를 낸다", () => {
    const before = structuredClone(input);
    const filter: InboxFilter = { kind: "publish", projects: ["z"], q: "web" };
    const beforeFilter = structuredClone(filter);
    expect(filterInbox(input, filter)).toEqual(filterInbox(input, filter));
    expect(input).toEqual(before);
    expect(filter).toEqual(beforeFilter);
  });
  it("빈 계획도 좁힌 결과가 없는 계획도 빈 묶음·unread 0이다", () => {
    expect(narrowed(plan(), { kind: "publish", projects: ["z"], q: "ja" })).toEqual(plan());
    expect(narrowed(input, { q: "no match" })).toEqual(plan());
  });
});

describe("검색 재료", () => {
  it("프로젝트 이름은 모든 종류를 찾고 질의와 대상 양쪽의 공백·대소문자를 정규화한다", () => {
    const input = plan(group("slug", allItems, "  My\t Web \n APP  "));
    expect(narrowed(input, { q: "  WEB\n\t app " })).toEqual(input);
    expect(narrowed(input, { q: "slug" })).toEqual(plan());
  });
  it.each([fixtures.review.item, fixtures.never_filled.item])("$kind는 소스·DB 언어 이름·언어 코드로 찾는다", item => {
    const input = plan(group("project", [item], "Project"));
    for (const q of [item.surfaceSlug.toUpperCase(), item.name.toUpperCase(), item.code.toUpperCase()]) {
      expect(narrowed(input, { q })).toEqual(input);
    }
  });
  it("언어 이름의 내부 공백도 정규화한다", () => {
    const input = plan(group("project", [{ ...fixtures.review.item, name: "Brazilian \t Portuguese" }], "Project"));
    expect(narrowed(input, { q: "brazilian   portuguese" })).toEqual(input);
  });
  it("import_failed는 사전 문장 대신 원본 surfaceSlug만 찾는다", () => {
    const input = plan(group("project", [fixtures.import_failed.item, partial], "Project"));
    expect(narrowed(input, { q: "CATALOG" })).toEqual(input);
    for (const q of ["sync failed", "partially synced", "parse-failed"]) expect(narrowed(input, { q })).toEqual(plan());
  });
  it.each([fixtures.unsent.item, fixtures.language_unsent.item])("$kind는 소스 slug로만 찾으며 ja에는 걸리지 않는다", item => {
    const input = plan(group("project", [item], "Project"));
    expect(narrowed(input, { q: "WEB" })).toEqual(input);
    expect(narrowed(input, { q: "ja" })).toEqual(plan());
  });
  it.each([fixtures.needs_reconnect.item, fixtures.setup.item])("$kind는 프로젝트 이름으로만 찾는다", item => {
    const input = plan(group("ja", [item], "Project"));
    expect(narrowed(input, { q: "project" })).toEqual(input);
    for (const q of ["ja", "web", "setup", "disconnected"]) expect(narrowed(input, { q })).toEqual(plan());
  });
  it("번역자 이름이나 사전 본문은 검색 재료가 아니다", () => {
    expect(narrowed(plan(group("project", [fixtures.review.item])), { q: "Actor" })).toEqual(plan());
  });
});

it("URL → 원래 계획 선택지 → 실효 필터 → 표시 계획을 잇고 원래 배지는 보존한다", () => {
  const project: InboxProject = {
    slug: "web", name: "Web App", image: null, role: "OWNER", status: "active",
    connectionPinned: true, gitlabTokenExpiresAt: null, createdAt: at,
    attention: [fixtures.review.item, fixtures.import_failed.item, partial],
    unsent: { count: 2, surfaceSlug: "web", at },
    language: { count: 1, surfaceSlug: "web", at, held: false },
  };
  const original = planInbox({ projects: [project], seenAt: null });
  const options = inboxFilterOptions(original);
  const selected = effectiveInboxFilter(parseInboxFilter({ project: "gone,web", kind: "publish", q: "WEB" }), options);
  expect(hasNarrowing(selected)).toBe(true);
  expect(inboxQuery(selected)).toEqual({ kind: "publish", project: "web", q: "WEB" });
  const shown = filterInbox(original, selected);
  expect(shown.groups[0]?.items.map(item => item.kind)).toEqual(["unsent", "language_unsent"]);
  expect(shown.unread).toBe(2);
  expect(original.unread).toBe(4);
  expect(options.kinds).toEqual(["publish", "review", "sync_failed", "partial"]);
  const stale = effectiveInboxFilter(parseInboxFilter({ project: "gone", kind: "setup" }), options);
  expect(hasNarrowing(stale)).toBe(false);
  expect(filterInbox(original, stale)).toEqual(original);
});
