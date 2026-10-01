import { describe, expect, it } from "vitest";
import {
  ALL_NAMESPACES,
  DEFAULT_TRANSLATION_QUERY,
  FIRST_KEY,
  MISSING_LANGUAGES,
  Q_MAX_LENGTH,
  STATUSES,
  allSourcesQuery,
  applyEmptyAction,
  emptyActions,
  hasConditions,
  isAllSources,
  isScreenCanonical,
  landOnFirstKey,
  listGenerationKey,
  nextQuery,
  parseTranslationQuery,
  screenQuery,
  searchQuery,
  selectQuery,
  serializeScreenQuery,
  serializeTranslationQuery,
  statusOf,
  translationsHref,
  treeQuery,
  withStatus,
  type Status,
  type TranslationQuery,
} from "../query";

/**
 * 번역 화면 URL 계약 (translation-rework T2 — design §3·§3.1·§10.2).
 *
 * ⚠️ **URL은 요청값을 든다, 적용값이 아니다** — `Missing in ja`는 ja가 없는 범위에서도 URL에 남고
 * 적용값은 `effectiveCompletion`이 계산한다(summary.test.ts). 그래야 뒤로/새로고침/공유가 같은 결과를 낸다.
 */
describe("parseTranslationQuery — 기본값", () => {
  it("빈 쿼리는 전체 네임스페이스 · All sources · All keys · Any state다 (translation-filter-scope — 2026-09-30 사용자)", () => {
    expect(parseTranslationQuery({})).toEqual(DEFAULT_TRANSLATION_QUERY);
    expect(DEFAULT_TRANSLATION_QUERY).toEqual({ ns: ALL_NAMESPACES, scope: "project", completion: "all" });
  });

  it("scope 없는 옛 링크는 All sources로 열리고, source·namespace는 그 범위로 열린다 (조건 8)", () => {
    expect(parseTranslationQuery({ ns: "auth" }).scope).toBe("project");
    expect(parseTranslationQuery({ scope: "source" }).scope).toBe("source");
    expect(parseTranslationQuery({ scope: "namespace", ns: "auth" }).scope).toBe("namespace");
  });

  it("ns가 없으면 '남은 일이 있는 첫 네임스페이스'로 착지하지 않고 전체다 (POSTMORTEM 2026-09-15 — 0건 착지)", () => {
    expect(parseTranslationQuery({ state: "review" }).ns).toBe(ALL_NAMESPACES);
  });
});

describe("parseTranslationQuery — 허용 목록", () => {
  it("scope·completion·state를 허용 목록으로 거른다", () => {
    expect(parseTranslationQuery({ scope: "source", completion: "complete", state: "unsent" })).toMatchObject({
      scope: "source", completion: "complete", state: "unsent",
    });
    expect(parseTranslationQuery({ scope: "galaxy", completion: "half", state: "lost" })).toEqual(DEFAULT_TRANSLATION_QUERY);
  });

  it("프로토타입 이름은 값이 아니다 — 사전 인덱싱으로 판정하지 않는다", () => {
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(parseTranslationQuery({ scope: name, completion: name, state: name })).toEqual(DEFAULT_TRANSLATION_QUERY);
    }
  });

  it("반복 파라미터는 첫 값을 쓴다", () => {
    expect(parseTranslationQuery({ scope: ["namespace", "project"], q: ["a", "b"] })).toMatchObject({ scope: "namespace", q: "a" });
  });

  it("missing은 언어가 있어야 선다 — 언어 없는 missing은 All keys다", () => {
    expect(parseTranslationQuery({ completion: "missing", missingLocale: "ja" })).toMatchObject({ completion: "missing", missingLocale: "ja" });
    expect(parseTranslationQuery({ completion: "missing" })).toMatchObject({ completion: "all" });
    expect(parseTranslationQuery({ completion: "missing" }).missingLocale).toBeUndefined();
  });

  it("missing이 아닌데 온 missingLocale은 버린다", () => {
    expect(parseTranslationQuery({ completion: "incomplete", missingLocale: "ja" }).missingLocale).toBeUndefined();
  });

  it("q는 앞뒤 공백을 걷고, 비면 검색 없음이며, 상한을 넘으면 자른다", () => {
    expect(parseTranslationQuery({ q: "  hello " }).q).toBe("hello");
    expect(parseTranslationQuery({ q: "   " }).q).toBeUndefined();
    expect(parseTranslationQuery({ q: "x".repeat(Q_MAX_LENGTH + 50) }).q).toHaveLength(Q_MAX_LENGTH);
    expect(Q_MAX_LENGTH).toBe(200);
  });

  it("sort 파라미터는 받지 않는다 — 정렬은 Incomplete first 하나다 (design §10.2)", () => {
    expect(parseTranslationQuery({ sort: "az" })).not.toHaveProperty("sort");
  });

  it("key·keySurface·cursor·language를 그대로 싣는다", () => {
    expect(parseTranslationQuery({ key: "k1", keySurface: "web", cursor: "c1", language: "ko" })).toMatchObject({
      key: "k1", keySurface: "web", cursor: "c1", language: "ko",
    });
    expect(parseTranslationQuery({ language: MISSING_LANGUAGES }).language).toBe("@missing");
  });

  it("빈 문자열 파라미터는 없는 것과 같다", () => {
    expect(parseTranslationQuery({ key: "", ns: "", language: "", cursor: "" })).toEqual(DEFAULT_TRANSLATION_QUERY);
  });
});

describe("parseTranslationQuery — 옛 링크", () => {
  it("state=untranslated는 completion=incomplete가 된다", () => {
    const q = parseTranslationQuery({ state: "untranslated" });
    expect(q.completion).toBe("incomplete");
    expect(q.state).toBeUndefined();
  });

  it("옛 state new·review·unsent는 그대로다", () => {
    for (const state of ["new", "review", "unsent"] as const) expect(parseTranslationQuery({ state }).state).toBe(state);
  });

  it("locales가 하나면 상세 언어로 옮기고, 여럿이면 전체로 연다", () => {
    expect(parseTranslationQuery({ locales: "ko" }).language).toBe("ko");
    expect(parseTranslationQuery({ locales: "ko,ja" }).language).toBeUndefined();
    expect(parseTranslationQuery({ locales: " , " }).language).toBeUndefined();
  });

  it("language가 있으면 옛 locales보다 우선한다", () => {
    expect(parseTranslationQuery({ locales: "ko", language: "ja" }).language).toBe("ja");
  });

  it("옛 focus는 무시한다", () => {
    expect(parseTranslationQuery({ focus: "ko" })).toEqual(DEFAULT_TRANSLATION_QUERY);
  });
});

describe("serializeTranslationQuery", () => {
  it("기본값은 URL에 싣지 않는다", () => {
    expect(serializeTranslationQuery(DEFAULT_TRANSLATION_QUERY)).toEqual({});
  });

  it("scope는 All sources일 때만 생략하고 source·namespace는 싣는다 — 왕복한다", () => {
    expect(serializeTranslationQuery({ ...DEFAULT_TRANSLATION_QUERY, scope: "project" })).not.toHaveProperty("scope");
    for (const scope of ["source", "namespace"] as const) {
      const query: TranslationQuery = { ...DEFAULT_TRANSLATION_QUERY, ns: "auth", scope };
      expect(serializeTranslationQuery(query).scope).toBe(scope);
      expect(parseTranslationQuery(serializeTranslationQuery(query))).toEqual(query);
    }
  });

  it("왕복한다 — 뒤로/새로고침/공유가 같은 요청값에서 시작한다", () => {
    const query: TranslationQuery = {
      ns: "common", scope: "project", completion: "missing", missingLocale: "ja", state: "new",
      q: "hello", cursor: "c1", key: "k1", keySurface: "web", language: "@missing",
    };
    const wire = serializeTranslationQuery(query);
    expect(wire).not.toHaveProperty("sort");
    expect(parseTranslationQuery(wire)).toEqual(query);
  });

  it("옛 파라미터(locales·focus·state=untranslated)는 내보내지 않는다", () => {
    const wire = serializeTranslationQuery(parseTranslationQuery({ state: "untranslated", locales: "ko", focus: "ja" }));
    expect(wire).toEqual({ completion: "incomplete", language: "ko" });
  });
});

describe("nextQuery — 조건이 바뀌면 cursor를 푼다", () => {
  const base: TranslationQuery = { ...DEFAULT_TRANSLATION_QUERY, cursor: "c9", key: "k1" };

  it("조건 축(ns·scope·completion·state·q)을 바꾸면 cursor가 빠진다", () => {
    expect(nextQuery(base, { q: "x" }).cursor).toBeUndefined();
    expect(nextQuery(base, { scope: "source" }).cursor).toBeUndefined();
    expect(nextQuery(base, { state: "unsent" }).cursor).toBeUndefined();
  });

  it("조건이 아닌 축(key·language)만 바꾸면 cursor를 유지한다", () => {
    expect(nextQuery(base, { key: "k2" }).cursor).toBe("c9");
    expect(nextQuery(base, { language: "ko" }).cursor).toBe("c9");
  });

  it("다른 완성도를 명시적으로 고르면 기억한 missingLocale도 지운다 (R5)", () => {
    const missing = { ...base, completion: "missing" as const, missingLocale: "ja" };
    expect(nextQuery(missing, { completion: "incomplete" }).missingLocale).toBeUndefined();
  });

  it("언어 없는 missing은 All keys로 접는다 — URL 왕복과 같은 상태여야 한다 (R5)", () => {
    const next = nextQuery(base, { completion: "missing" });
    expect(next.completion).toBe("all");
    expect(parseTranslationQuery(serializeTranslationQuery(next))).toEqual(next);
  });

  it("같은 값으로 바꾸는 것은 조건 변경이 아니다", () => {
    expect(nextQuery(base, { scope: "project" }).cursor).toBe("c9");
  });
});

describe("landOnFirstKey — 서버가 트리 이동의 첫 키를 고른다", () => {
  const tree: TranslationQuery = { ...DEFAULT_TRANSLATION_QUERY, ns: "auth", key: FIRST_KEY };

  it("첫 행이 있으면 그 키와 소스를 선택으로 싣는다", () => {
    expect(landOnFirstKey(tree, { keyId: "k9", surfaceSlug: "app" })).toEqual({ ...tree, key: "k9", keySurface: "app" });
  });

  it("행이 없으면 선택을 비운다 — 예약값이 주소·상세로 새지 않는다", () => {
    const next = landOnFirstKey({ ...tree, keySurface: "web" }, undefined);
    expect(next.key).toBeUndefined();
    expect(next.keySurface).toBeUndefined();
    expect(next).toMatchObject({ ns: "auth", scope: "project" });
  });
});


/*
  ── 화면 URL 층 (translation-tree-range — design §2.1) ─────────────────────────────────────────────
  파서·직렬화·기본값은 MCP `list_keys`의 외부 계약으로 동결되고(위 블록은 무수정이다), 화면은 그 위에 정규화 층을 얹는다.
  트리 = 목록 범위, 필터는 Status 하나, 검색은 전 소스다(2026-10-01 사용자).
*/
const q = (over: Partial<TranslationQuery> = {}): TranslationQuery => ({ ...DEFAULT_TRANSLATION_QUERY, ...over });

describe("MCP 동결 — 화면 층이 기존 파서의 해석을 바꾸지 않는다 (조건 15)", () => {
  it("기본 범위는 여전히 전 소스이고, 옛 완성도 값을 그대로 읽는다", () => {
    expect(DEFAULT_TRANSLATION_QUERY.scope).toBe("project");
    expect(parseTranslationQuery({ completion: "missing", missingLocale: "ja" })).toMatchObject({ completion: "missing", missingLocale: "ja" });
    expect(parseTranslationQuery({ completion: "complete" }).completion).toBe("complete");
    expect(parseTranslationQuery({ cursor: "c1" }).cursor).toBe("c1");
  });

  it("같은 로케일 없는 completion=missing이 화면에서는 Incomplete, MCP 파서에서는 All keys다", () => {
    expect(screenQuery({ completion: "missing" }).completion).toBe("incomplete");
    expect(parseTranslationQuery({ completion: "missing" }).completion).toBe("all");
  });
});

describe("statusOf · withStatus — 필터 축은 Status 하나다 (조건 3)", () => {
  it("STATUSES는 다섯이고 순서가 메뉴 순서다", () => {
    expect(STATUSES).toEqual(["all", "incomplete", "review", "unsent", "new"]);
  });

  const cases: [string, Partial<TranslationQuery>, Status][] = [
    ["기본값", {}, "all"],
    ["Incomplete", { completion: "incomplete" }, "incomplete"],
    ["옛 Untranslated in", { completion: "missing", missingLocale: "ja" }, "incomplete"],
    ["옛 Complete", { completion: "complete" }, "all"],
    ["Needs review", { state: "review" }, "review"],
    ["옛 두 축 — 상태가 이긴다", { completion: "incomplete", state: "unsent" }, "unsent"],
  ];
  for (const [name, over, status] of cases) it(`${name} → ${status}`, () => expect(statusOf(q(over))).toBe(status));

  it("withStatus는 completion·state 한 쌍만 바꾸고 둘이 동시에 서지 않는다 — 위치·검색어·선택·언어는 남는다", () => {
    const base = q({ ns: "auth", scope: "namespace", completion: "missing", missingLocale: "ja", state: "review", q: "hi", key: "k1", keySurface: "web", language: "ko", cursor: "c1" });
    for (const status of STATUSES) {
      const next = withStatus(base, status);
      expect(statusOf(next)).toBe(status);
      expect(next.completion === "incomplete" && next.state !== undefined).toBe(false);
      expect(next.missingLocale).toBeUndefined();
      expect(next.cursor).toBeUndefined();
      expect(next).toMatchObject({ ns: "auth", scope: "namespace", q: "hi", key: "k1", keySurface: "web", language: "ko" });
    }
    expect(withStatus(base, "all")).not.toHaveProperty("state");
    expect(withStatus(base, "all").completion).toBe("all");
  });
});

describe("screenQuery — 원본 URL 입력을 화면 요청값으로 (design §2.1 · 조건 11)", () => {
  it("검색어가 없으면 scope는 무시되고 위치에서 파생된다", () => {
    expect(screenQuery({})).toEqual({ ns: ALL_NAMESPACES, scope: "source", completion: "all" });
    expect(screenQuery({ ns: "auth" }).scope).toBe("namespace");
    expect(screenQuery({ scope: "project" }).scope).toBe("source");
    expect(screenQuery({ scope: "project", ns: "auth" }).scope).toBe("namespace");
    expect(screenQuery({ scope: "namespace" }).scope).toBe("source");
  });

  it("검색어가 있으면 기본이 전 소스이고, source·namespace는 위치로 좁힌 검색이다", () => {
    expect(screenQuery({ q: "hi" }).scope).toBe("project");
    expect(screenQuery({ q: "hi", scope: "project", ns: "auth" }).scope).toBe("project");
    expect(screenQuery({ q: "hi", scope: "source" }).scope).toBe("source");
    expect(screenQuery({ q: "hi", scope: "namespace", ns: "auth" }).scope).toBe("namespace");
    // 위치에서 파생한다 — 전체 네임스페이스의 namespace 범위는 소스다.
    expect(screenQuery({ q: "hi", scope: "namespace" }).scope).toBe("source");
    expect(screenQuery({ q: "hi", scope: "source", ns: "auth" }).scope).toBe("namespace");
  });

  it("옛 Untranslated in → Incomplete + 상세 언어 · 로케일 없는 missing → Incomplete · completion 없는 missingLocale은 버린다", () => {
    expect(screenQuery({ completion: "missing", missingLocale: "ja" })).toEqual({ ns: ALL_NAMESPACES, scope: "source", completion: "incomplete", language: "ja" });
    expect(screenQuery({ completion: "missing" })).toEqual({ ns: ALL_NAMESPACES, scope: "source", completion: "incomplete" });
    expect(screenQuery({ missingLocale: "ja" })).toEqual({ ns: ALL_NAMESPACES, scope: "source", completion: "all" });
    // 이미 고른 상세 언어가 이긴다.
    expect(screenQuery({ completion: "missing", missingLocale: "ja", language: "ko" }).language).toBe("ko");
  });

  it("옛 Complete → All keys · Incomplete와 state가 함께 오면 state 하나 · 옛 state=untranslated → Incomplete", () => {
    expect(screenQuery({ completion: "complete" }).completion).toBe("all");
    expect(screenQuery({ completion: "incomplete", state: "review" })).toMatchObject({ completion: "all", state: "review" });
    expect(screenQuery({ state: "untranslated" })).toMatchObject({ completion: "incomplete" });
    expect(screenQuery({ state: "untranslated" }).state).toBeUndefined();
  });

  it("cursor는 항상 버린다 — 화면 목록은 전량이다", () => {
    expect(screenQuery({ cursor: "c1", ns: "auth" })).not.toHaveProperty("cursor");
    expect(screenQuery({ cursor: "c1", q: "hi" })).not.toHaveProperty("cursor");
  });

  it("선택 키·keySurface·상세 언어는 그대로 싣는다", () => {
    expect(screenQuery({ key: "k1", keySurface: "app", language: MISSING_LANGUAGES })).toMatchObject({ key: "k1", keySurface: "app", language: "@missing" });
    expect(screenQuery({ key: FIRST_KEY }).key).toBe(FIRST_KEY);
  });

  it("정규화된 값의 왕복 고정점 — screenQuery(serializeScreenQuery(x)) = x", () => {
    const raws = [
      {}, { ns: "auth" }, { q: "hi" }, { q: "hi", scope: "source" }, { q: "hi", ns: "auth", scope: "namespace" }, { q: "hi", ns: "auth" },
      { completion: "missing", missingLocale: "ja", ns: "common", key: "k1", keySurface: "web" }, { state: "new", q: "x", language: "@missing" },
      { completion: "incomplete", state: "unsent", cursor: "c1", scope: "project" }, { key: FIRST_KEY, ns: "auth" }, { ns: "__proto__", q: "constructor" },
    ];
    for (const raw of raws) {
      const x = screenQuery(raw);
      expect(screenQuery(serializeScreenQuery(x)), JSON.stringify(raw)).toEqual(x);
    }
  });
});

describe("serializeScreenQuery · translationsHref", () => {
  it("scope는 위치로 좁힌 검색일 때만 싣는다 — 위치 탐색·전 소스 검색은 주소에 없다", () => {
    expect(serializeScreenQuery(screenQuery({ ns: "auth" }))).toEqual({ ns: "auth" });
    expect(serializeScreenQuery(screenQuery({}))).toEqual({});
    expect(serializeScreenQuery(screenQuery({ q: "hi", ns: "auth" }))).toEqual({ ns: "auth", q: "hi" });
    expect(serializeScreenQuery(screenQuery({ q: "hi", ns: "auth", scope: "namespace" }))).toEqual({ ns: "auth", scope: "namespace", q: "hi" });
    expect(serializeScreenQuery(screenQuery({ q: "hi", scope: "source" }))).toEqual({ scope: "source", q: "hi" });
  });

  const params = (href: string) => Object.fromEntries(new URL(href, "http://x").searchParams);

  it("translationsHref는 옛 형 입력도 화면 정규형으로 직렬화한다", () => {
    expect(params(translationsHref("acme", "web", q({ ns: "common", key: "k1", keySurface: "web" })))).toEqual({ ns: "common", key: "k1", keySurface: "web" });
    expect(params(translationsHref("acme", "web", q({ completion: "missing", missingLocale: "ja" })))).toEqual({ completion: "incomplete", language: "ja" });
    expect(params(translationsHref("acme", "web", q({ completion: "complete", cursor: "c1", scope: "source" })))).toEqual({});
    expect(params(translationsHref("acme", "web", q({ q: "hi" })))).toEqual({ q: "hi" });
    expect(translationsHref("acme", "web", q()).startsWith("/projects/acme/surfaces/web/translations")).toBe(true);
  });
});

describe("isScreenCanonical — redirect 판정은 파라미터 집합 비교다 (design §3.1)", () => {
  const canonical = (raw: Record<string, string | string[] | undefined>) => isScreenCanonical(raw, screenQuery(raw));

  it("정규형은 그대로 렌더한다 — 루프가 없다", () => {
    for (const raw of [{}, { q: "hi" }, { q: "hi", scope: "source" }, { q: "hi", ns: "auth", scope: "namespace" }, { ns: "auth" }, { state: "review" }, { state: "review", q: "hi" }, { completion: "incomplete", language: "ja" }, { key: FIRST_KEY, ns: "auth" }]) {
      expect(canonical(raw), JSON.stringify(raw)).toBe(true);
    }
  });

  /*
    ⚠️ `ns=*`는 기본값이지만 같은 것으로 본다 — Home의 상태 링크가 그것을 싣는다(POSTMORTEM 2026-09-15). 다르게 보면 카드를 누를 때마다
    redirect 왕복이 하나 더 붙는다(audit-ux #4b가 없앤 왕복).
  */
  it("ns=*는 생략과 같다", () => {
    expect(canonical({ ns: ALL_NAMESPACES })).toBe(true);
    expect(canonical({ ns: ALL_NAMESPACES, state: "review" })).toBe(true);
    expect(canonical({ ns: ALL_NAMESPACES, completion: "incomplete", language: "ja" })).toBe(true);
  });

  it("옛 주소·잔여 파라미터·순서 아닌 값의 차이는 redirect다", () => {
    for (const raw of [
      { scope: "project" }, { scope: "namespace", ns: "auth" }, { q: "hi", scope: "project" }, { cursor: "c1" }, { missingLocale: "ja" },
      { completion: "missing", missingLocale: "ja" }, { completion: "complete" }, { completion: "incomplete", state: "review" }, { q: " hi " },
      { state: "untranslated" }, { locales: "ko" }, { focus: "ja" }, { key: "" }, { ns: ["a", "b"] }, { foo: "bar" },
    ]) expect(canonical(raw), JSON.stringify(raw)).toBe(false);
  });

  it("보정된 쿼리(언어 제거 등)와 다르면 redirect다", () => {
    const raw = { language: "zz" };
    const { language: _language, ...fixed } = screenQuery(raw);
    expect(isScreenCanonical(raw, fixed)).toBe(false);
    expect(isScreenCanonical(serializeScreenQuery(fixed), fixed)).toBe(true);
  });
});

describe("treeQuery — 트리 클릭은 목록 범위다 (조건 1·2·6)", () => {
  const base = q({ ns: "common", scope: "project", q: "hi", state: "review", cursor: "c1", key: "k1", keySurface: "app", language: "ko" });

  it("ns와 그 위치의 범위를 싣고 Status·검색어·상세 언어는 그대로 둔다", () => {
    expect(treeQuery(base, "auth")).toMatchObject({ ns: "auth", scope: "namespace", q: "hi", state: "review", language: "ko" });
    expect(treeQuery(base, ALL_NAMESPACES)).toMatchObject({ ns: ALL_NAMESPACES, scope: "source" });
  });

  it("주소의 completion·state·q가 트리 이동 전후로 같다 (조건 2)", () => {
    const before = serializeScreenQuery(withStatus(base, "incomplete"));
    const after = serializeScreenQuery(treeQuery(withStatus(base, "incomplete"), "auth"));
    for (const name of ["completion", "state", "q"] as const) expect(after[name]).toBe(before[name]);
  });

  it("선택 자리에 FIRST_KEY를 싣고 keySurface·cursor를 비운다", () => {
    const next = treeQuery(base, "auth");
    expect(next.key).toBe(FIRST_KEY);
    expect(next.keySurface).toBeUndefined();
    expect(next.cursor).toBeUndefined();
  });
});

describe("allSourcesQuery · searchQuery — 검색은 전 소스다 (조건 4·5·6)", () => {
  it("All sources 노드는 범위만 전 소스로 — 위치·선택·검색어·Status는 남는다", () => {
    const narrowed = q({ ns: "auth", scope: "namespace", q: "hi", state: "unsent", key: "k1", keySurface: "web", cursor: "c1" });
    const { cursor: _cursor, ...rest } = narrowed;
    expect(allSourcesQuery(narrowed)).toEqual({ ...rest, scope: "project" });
  });

  it("새 검색어는 전 소스다 — 위치로 좁힌 검색에서 검색어를 바꿔도 넓어진다", () => {
    expect(searchQuery(q({ ns: "auth", scope: "namespace" }), "hi")).toMatchObject({ ns: "auth", scope: "project", q: "hi" });
    expect(searchQuery(q({ ns: "auth", scope: "namespace", q: "hi" }), "hello")).toMatchObject({ scope: "project", q: "hello" });
  });

  it("같은 검색어를 다시 제출하면 쿼리 그대로다 — 좁힌 범위가 남는다", () => {
    const narrowed = q({ ns: "auth", scope: "namespace", q: "hi" });
    expect(searchQuery(narrowed, "hi")).toBe(narrowed);
    expect(searchQuery(narrowed, "  hi ")).toBe(narrowed);
  });

  it("공백만·undefined는 지우기다 — 범위가 위치로 돌아간다(새 전 소스 검색이 아니다)", () => {
    for (const value of ["", "   ", undefined]) {
      const next = searchQuery(q({ ns: "common", scope: "project", q: "hi", key: "k1", keySurface: "web" }), value);
      expect(next.q).toBeUndefined();
      expect(next).toMatchObject({ ns: "common", scope: "namespace", key: "k1", keySurface: "web" });
    }
    expect(searchQuery(q({ scope: "project", q: "hi" }), "").scope).toBe("source");
  });

  it("검색어는 상한에서 자른다 — 주소 왕복과 같은 값이어야 한다", () => {
    expect(searchQuery(q({ scope: "source" }), "x".repeat(Q_MAX_LENGTH + 10)).q).toHaveLength(Q_MAX_LENGTH);
  });
});

describe("selectQuery — 키 선택 (조건 7)", () => {
  const row = (surfaceSlug: string, namespace: string, keyId = "k9") => ({ keyId, surfaceSlug, namespace });

  it("위치 범위·좁힌 검색에서는 범위를 바꾸지 않는다", () => {
    for (const base of [q({ ns: "auth", scope: "namespace" }), q({ ns: "auth", scope: "namespace", q: "hi" }), q({ scope: "source", q: "hi" })]) {
      expect(selectQuery(base, row("web", "common"))).toEqual({ query: { ...base, key: "k9", keySurface: "web" }, surfaceSlug: null });
    }
  });

  it("전 소스 범위면 항상 키의 소스·네임스페이스로 위치를 맞춘다 — ns=*도 예외 없다", () => {
    const all = q({ ns: "auth", scope: "project", q: "hi" });
    expect(selectQuery(all, row("app", "common"))).toEqual({ query: { ...all, ns: "common", key: "k9", keySurface: "app" }, surfaceSlug: "app" });
    const star = q({ scope: "project", q: "hi" });
    expect(selectQuery(star, row("web", "common")).query.ns).toBe("common");
    expect(selectQuery(star, row("web", "common")).surfaceSlug).toBe("web");
  });

  it("두 소스에 같은 이름의 키가 있어도 keyId·소스로 정확히 고른다", () => {
    const all = q({ scope: "project", q: "title" });
    expect(selectQuery(all, row("app", "auth", "a1")).query).toMatchObject({ key: "a1", keySurface: "app" });
    expect(selectQuery(all, row("web", "auth", "w1")).query).toMatchObject({ key: "w1", keySurface: "web" });
  });
});

describe("isAllSources · hasConditions", () => {
  const cases: [string, Partial<TranslationQuery>, boolean, boolean][] = [
    ["위치(소스)", { scope: "source" }, false, false],
    ["검색어 없는 project(옛 값)", { scope: "project" }, false, false],
    ["전 소스 검색", { scope: "project", q: "hi" }, true, true],
    ["위치로 좁힌 검색", { scope: "namespace", ns: "auth", q: "hi" }, false, true],
    ["Status", { scope: "source", state: "review" }, false, true],
    ["Incomplete", { scope: "source", completion: "incomplete" }, false, true],
    ["옛 Complete는 조건이 아니다", { scope: "source", completion: "complete" }, false, false],
    ["위치·선택·언어", { scope: "namespace", ns: "auth", key: "k1", keySurface: "web", language: "ko" }, false, false],
  ];
  for (const [name, over, all, conditions] of cases) {
    it(`${name} → isAllSources ${all} · hasConditions ${conditions}`, () => {
      expect(isAllSources(q(over))).toBe(all);
      expect(hasConditions(q(over))).toBe(conditions);
    });
  }
});

describe("emptyActions · applyEmptyAction — 0건 빈 상태 (조건 13 · design §2.1 표)", () => {
  const kinds = (query: TranslationQuery, noKeys = false) => {
    const actions = emptyActions(query, { noKeys });
    return [actions.primary?.kind ?? null, actions.secondary?.kind ?? null];
  };

  it("활성 키 0 → 버튼 없음", () => {
    expect(kinds(q({ q: "hi", scope: "namespace", ns: "auth", state: "review" }), true)).toEqual([null, null]);
  });

  it("검색어 · 위치로 좁힘 → Search all sources (+ Status 켜짐이면 Clear filters)", () => {
    expect(kinds(q({ q: "hi", scope: "namespace", ns: "auth" }))).toEqual(["search-all", null]);
    expect(kinds(q({ q: "hi", scope: "source", completion: "incomplete" }))).toEqual(["search-all", "clear-filters"]);
  });

  it("검색어 · All sources → Clear search (+ Status 켜짐이면 Clear filters)", () => {
    expect(kinds(q({ q: "hi", scope: "project" }))).toEqual(["clear-search", null]);
    expect(kinds(q({ q: "hi", scope: "project", state: "new" }))).toEqual(["clear-search", "clear-filters"]);
  });

  it("검색어 없음 · Status 켜짐 → Clear filters 하나 · 꺼짐(빈 위치) → 없음", () => {
    expect(kinds(q({ scope: "source", state: "unsent" }))).toEqual(["clear-filters", null]);
    expect(kinds(q({ scope: "namespace", ns: "auth" }))).toEqual([null, null]);
  });

  it("라벨 키가 종류와 짝이다", () => {
    expect(emptyActions(q({ q: "hi", scope: "source", state: "new" }), { noKeys: false })).toMatchObject({ primary: { label: "searchAll" }, secondary: { label: "clearFilters" } });
    expect(emptyActions(q({ q: "hi", scope: "project" }), { noKeys: false }).primary?.label).toBe("clearSearch");
  });

  const view = q({ ns: "auth", scope: "namespace", completion: "incomplete", q: "hi", key: "k1", keySurface: "web", language: "ko" });

  it("목적지: search-all = allSourcesQuery · clear-search = 검색 지우기 · clear-filters = Status만 All keys(검색어는 남는다)", () => {
    expect(applyEmptyAction("search-all", view)).toEqual(allSourcesQuery(view));
    expect(applyEmptyAction("clear-search", view)).toEqual(searchQuery(view, undefined));
    expect(applyEmptyAction("clear-filters", view)).toEqual(withStatus(view, "all"));
    expect(applyEmptyAction("clear-filters", view).q).toBe("hi");
  });

  it("버튼 쿼리 = applyEmptyAction — 같은 쿼리에 적용하면 같은 목적지", () => {
    for (const query of [view, { ...view, scope: "project" as const }, withStatus({ ...view, q: undefined, scope: "namespace" as const }, "review")]) {
      const { primary, secondary } = emptyActions(query, { noKeys: false });
      for (const action of [primary, secondary]) if (action !== null) expect(applyEmptyAction(action.kind, query)).toEqual(action.query);
    }
  });
});

describe("listGenerationKey — 목록 세대 (design §2.3 · POSTMORTEM 2026-10-01 #157)", () => {
  it("전 소스 범위에서는 ns·경로가 바뀌어도 같은 세대다", () => {
    const all = q({ scope: "project", q: "hi", ns: "common" });
    expect(listGenerationKey({ ...all, ns: "auth" }, "app")).toBe(listGenerationKey(all, "web"));
  });

  it("위치 범위에서는 ns·경로가 바뀌면 새 세대다", () => {
    const at = q({ scope: "namespace", ns: "common" });
    expect(listGenerationKey({ ...at, ns: "auth" }, "web")).not.toBe(listGenerationKey(at, "web"));
    expect(listGenerationKey(at, "app")).not.toBe(listGenerationKey(at, "web"));
  });

  it("Status·검색어·범위가 바뀌면 새 세대다 — 선택·언어는 세대가 아니다", () => {
    const at = q({ scope: "namespace", ns: "common", q: "hi" });
    expect(listGenerationKey(withStatus(at, "review"), "web")).not.toBe(listGenerationKey(at, "web"));
    expect(listGenerationKey({ ...at, q: "ho" }, "web")).not.toBe(listGenerationKey(at, "web"));
    expect(listGenerationKey(allSourcesQuery(at), "web")).not.toBe(listGenerationKey(at, "web"));
    expect(listGenerationKey({ ...at, key: "k2", keySurface: "app", language: "ko" }, "web")).toBe(listGenerationKey(at, "web"));
  });

  it("__proto__ 네임스페이스도 다른 이름과 구분된다", () => {
    expect(listGenerationKey(q({ scope: "namespace", ns: "__proto__" }), "web")).not.toBe(listGenerationKey(q({ scope: "namespace", ns: "x" }), "web"));
  });
});
