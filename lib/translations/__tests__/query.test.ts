import { describe, expect, it } from "vitest";
import {
  ALL_NAMESPACES,
  DEFAULT_TRANSLATION_QUERY,
  MISSING_LANGUAGES,
  Q_MAX_LENGTH,
  clearFilters,
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
  it("빈 쿼리는 전체 네임스페이스 · This source · All keys · Any state다", () => {
    expect(parseTranslationQuery({})).toEqual(DEFAULT_TRANSLATION_QUERY);
    expect(DEFAULT_TRANSLATION_QUERY).toEqual({ ns: ALL_NAMESPACES, scope: "source", completion: "all" });
  });

  it("ns가 없으면 '남은 일이 있는 첫 네임스페이스'로 착지하지 않고 전체다 (POSTMORTEM 2026-09-15 — 0건 착지)", () => {
    expect(parseTranslationQuery({ state: "review" }).ns).toBe(ALL_NAMESPACES);
  });
});

describe("parseTranslationQuery — 허용 목록", () => {
  it("scope·completion·state를 허용 목록으로 거른다", () => {
    expect(parseTranslationQuery({ scope: "project", completion: "complete", state: "unsent" })).toMatchObject({
      scope: "project", completion: "complete", state: "unsent",
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
    expect(nextQuery(base, { scope: "project" }).cursor).toBeUndefined();
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

  it("같은 값으로 바꾸는 것은 조건 변경이 아니다", () => {
    expect(nextQuery(base, { scope: "source" }).cursor).toBe("c9");
  });
});

describe("clearFilters — 세 축만 기본값으로", () => {
  it("완성도·상태·범위를 되돌리고 검색어·트리 선택·상세 언어·선택 키는 남긴다", () => {
    const query: TranslationQuery = {
      ns: "common", scope: "project", completion: "missing", missingLocale: "ja", state: "review",
      q: "hello", cursor: "c1", key: "k1", keySurface: "web", language: "ko",
    };
    expect(clearFilters(query)).toEqual({ ns: "common", scope: "source", completion: "all", q: "hello", key: "k1", keySurface: "web", language: "ko" });
  });

  it("기억한 missingLocale까지 지운다 — 넓혀도 되살리지 않는다 (R5)", () => {
    const cleared = clearFilters({ ...DEFAULT_TRANSLATION_QUERY, completion: "missing", missingLocale: "ja" });
    expect(cleared.missingLocale).toBeUndefined();
    expect(cleared.completion).toBe("all");
  });
});

describe("treeQuery — 트리 클릭", () => {
  const base: TranslationQuery = { ...DEFAULT_TRANSLATION_QUERY, q: "hi", state: "unsent", cursor: "c1", key: "k1", keySurface: "web" };

  it("네임스페이스 클릭은 This namespace를 함께 설정한다", () => {
    expect(treeQuery(base, "auth")).toMatchObject({ ns: "auth", scope: "namespace", q: "hi", state: "unsent" });
  });

  it("All namespaces 클릭은 This source다", () => {
    expect(treeQuery({ ...base, scope: "namespace", ns: "auth" }, ALL_NAMESPACES)).toMatchObject({ ns: ALL_NAMESPACES, scope: "source" });
  });

  it("선택 키와 cursor를 비운다 — 첫 키는 새 목록에서 고른다", () => {
    const next = treeQuery(base, "auth");
    expect(next.key).toBeUndefined();
    expect(next.keySurface).toBeUndefined();
    expect(next.cursor).toBeUndefined();
  });
});
