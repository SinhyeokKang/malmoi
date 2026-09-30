import { describe, expect, it } from "vitest";
import {
  ALL_NAMESPACES,
  DEFAULT_TRANSLATION_QUERY,
  FIRST_KEY,
  MISSING_LANGUAGES,
  Q_MAX_LENGTH,
  clearFilters,
  emptyActions,
  hasConditions,
  isNarrowed,
  landOnFirstKey,
  nextQuery,
  parseTranslationQuery,
  serializeTranslationQuery,
  treeQuery,
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

describe("clearFilters — 세 축만 기본값으로", () => {
  it("완성도·상태·범위(All sources)를 되돌리고 검색어·트리 선택·상세 언어·선택 키는 남긴다 (조건 7)", () => {
    const query: TranslationQuery = {
      ns: "common", scope: "namespace", completion: "missing", missingLocale: "ja", state: "review",
      q: "hello", cursor: "c1", key: "k1", keySurface: "web", language: "ko",
    };
    expect(clearFilters(query)).toEqual({ ns: "common", scope: "project", completion: "all", q: "hello", key: "k1", keySurface: "web", language: "ko" });
  });

  it("기억한 missingLocale까지 지운다 — 넓혀도 되살리지 않는다 (R5)", () => {
    const cleared = clearFilters({ ...DEFAULT_TRANSLATION_QUERY, completion: "missing", missingLocale: "ja" });
    expect(cleared.missingLocale).toBeUndefined();
    expect(cleared.completion).toBe("all");
  });
});

describe("treeQuery — 트리 클릭은 위치다, 필터가 아니다 (translation-filter-scope 조건 3)", () => {
  const base: TranslationQuery = {
    ...DEFAULT_TRANSLATION_QUERY, completion: "missing", missingLocale: "ja", q: "hi", state: "unsent",
    cursor: "c1", key: "k1", keySurface: "web", language: "ko",
  };

  it("ns(위치)만 바꾸고 scope·completion·missingLocale·state·q·language는 그대로 둔다", () => {
    for (const scope of ["project", "source"] as const) {
      for (const ns of ["auth", ALL_NAMESPACES]) {
        const next = treeQuery({ ...base, scope }, ns);
        expect(next).toMatchObject({ ns, scope, completion: "missing", missingLocale: "ja", state: "unsent", q: "hi", language: "ko" });
      }
    }
  });

  it("This namespace에서는 scope를 보존하고 ns만 바뀐다 — 대상이 새 위치를 따라간다", () => {
    expect(treeQuery({ ...base, scope: "namespace", ns: "auth" }, "billing")).toMatchObject({ ns: "billing", scope: "namespace" });
  });

  it("주소의 조건 파라미터가 트리 이동 전후로 같다", () => {
    const before = serializeTranslationQuery({ ...base, scope: "source" });
    const after = serializeTranslationQuery(treeQuery({ ...base, scope: "source" }, "auth"));
    for (const name of ["scope", "completion", "missingLocale", "state", "q"] as const) expect(after[name]).toBe(before[name]);
  });

  /*
    ⚠️ **첫 키는 서버가 같은 렌더에서 고른다** (audit-ux #18) — 전엔 선택을 비운 주소로 한 번, 첫 키를 받은 effect가 `replace`로 또
    한 번 왕복해 상세가 "Select a key"로 번쩍였다. 예약값 `@first`가 "새 위치의 첫 키"를 뜻한다.
  */
  it("선택 키 자리에 FIRST_KEY를 싣고 keySurface·cursor를 비운다", () => {
    const next = treeQuery(base, "auth");
    expect(next.key).toBe(FIRST_KEY);
    expect(next.keySurface).toBeUndefined();
    expect(next.cursor).toBeUndefined();
    expect(serializeTranslationQuery(next).key).toBe("@first");
  });
});

describe("isNarrowed · hasConditions — 필터가 켜졌나", () => {
  const cases: [string, Partial<TranslationQuery>, boolean, boolean][] = [
    ["기본값", {}, false, false],
    ["트리 위치만", { ns: "auth", key: "k1", keySurface: "web", language: "ko" }, false, false],
    ["검색만", { q: "hi" }, false, true],
    ["완성도", { completion: "incomplete" }, true, true],
    ["Missing in", { completion: "missing", missingLocale: "ja" }, true, true],
    ["상태", { state: "review" }, true, true],
    ["This source", { scope: "source" }, true, true],
    ["This namespace", { scope: "namespace", ns: "auth" }, true, true],
  ];
  for (const [name, patch, narrowed, conditions] of cases) {
    it(`${name} → isNarrowed ${narrowed} · hasConditions ${conditions}`, () => {
      const query = { ...DEFAULT_TRANSLATION_QUERY, ...patch };
      expect(isNarrowed(query)).toBe(narrowed);
      expect(hasConditions(query)).toBe(conditions);
    });
  }
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

describe("emptyActions — 0건 빈 상태의 버튼 (translation-filter-scope design §2.3 · 조건 9)", () => {
  const q = (over: Partial<TranslationQuery>): TranslationQuery => ({ ...DEFAULT_TRANSLATION_QUERY, ...over });
  const kinds = (query: TranslationQuery, noKeys = false) => {
    const actions = emptyActions(query, { noKeys });
    return [actions.primary?.kind ?? null, actions.secondary?.kind ?? null];
  };

  it("키 0개면 버튼이 없다 — 좁힌 것이 아니라 아직 온 것이 없다", () => {
    expect(kinds(q({ q: "hi", scope: "source", state: "review" }), true)).toEqual([null, null]);
  });

  it("검색어 + 좁힌 범위 → Search all sources", () => {
    expect(kinds(q({ q: "hi", scope: "source" }))).toEqual(["search-all", null]);
    expect(kinds(q({ q: "hi", scope: "namespace", ns: "auth" }))).toEqual(["search-all", null]);
  });

  it("Search all sources는 scope만 All sources로 바꾼다 — 완성도·상태·검색어·위치·선택은 그대로", () => {
    const query = q({ q: "hi", scope: "namespace", ns: "auth", completion: "missing", missingLocale: "ja", state: "review", key: "k1", keySurface: "web", cursor: "c1" });
    const { primary, secondary } = emptyActions(query, { noKeys: false });
    const { cursor: _cursor, ...rest } = query;
    expect(primary).toEqual({ kind: "search-all", query: { ...rest, scope: "project" } });
    expect(secondary?.kind).toBe("show-all");
  });

  it("검색어 + All sources → Clear search, 완성도·상태가 켜졌을 때만 Show all이 함께 선다", () => {
    expect(kinds(q({ q: "hi" }))).toEqual(["clear-search", null]);
    expect(kinds(q({ q: "hi", completion: "incomplete" }))).toEqual(["clear-search", "show-all"]);
    expect(kinds(q({ q: "hi", state: "new" }))).toEqual(["clear-search", "show-all"]);
    expect(emptyActions(q({ q: "hi", state: "new" }), { noKeys: false }).primary?.query).toEqual(q({ state: "new" }));
  });

  it("검색어 없이 좁혔으면 Show all 하나 — clearFilters와 같은 쿼리다", () => {
    for (const over of [{ scope: "source" as const }, { completion: "incomplete" as const }, { state: "unsent" as const }]) {
      const query = q(over);
      expect(emptyActions(query, { noKeys: false })).toEqual({ primary: { kind: "show-all", query: clearFilters(query) }, secondary: null });
    }
  });

  it("검색어도 필터도 없으면 버튼이 없다", () => {
    expect(kinds(q({}))).toEqual([null, null]);
  });
});
