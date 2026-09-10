import { describe, expect, it } from "vitest";

import { activeFilters, clearedQuery } from "../filters";

/**
 * 칩 행의 유일한 출처 (8-4 T2 — design §3.5).
 *
 * `next`가 **그 칩을 뗀 뒤의 쿼리**다 — 화면이 쿼리 조립을 다시 하면 규칙이 두 벌이 되고
 * 하나가 낡는다.
 */
const ctx = (selected: string[], fallback: string[] = ["en", "ko", "ja"]) => ({ selected, fallback });

describe("activeFilters — 기본 상태에는 칩이 없다", () => {
  it("아무것도 안 걸었으면 0개다 — 초기화 버튼이 그때 안 보인다", () => {
    expect(activeFilters({ ns: "*" }, ctx(["en", "ko", "ja"]))).toEqual([]);
  });

  it("네임스페이스가 미지정이어도 칩이 아니다 — 기본 착지는 사용자가 고른 것이 아니다", () => {
    expect(activeFilters({}, ctx(["en", "ko", "ja"]))).toEqual([]);
  });

  it("선택이 기본과 같으면 로케일 칩이 없다 — 순서만 다른 경우도 같다", () => {
    expect(activeFilters({ locales: "ja,ko,en" }, ctx(["en", "ko", "ja"]))).toEqual([]);
  });
});

describe("activeFilters — 칩 셋", () => {
  it("네임스페이스 칩을 낸다", () => {
    const chips = activeFilters({ ns: "common" }, ctx(["en", "ko", "ja"]));
    expect(chips).toEqual([{ key: "namespace", value: "common", next: { ns: "*" } }]);
  });

  /** ⚠️ **코드마다가 아니라 하나로 묶는다** — 마지막 하나를 떼면 폴백이 걸려 오히려 넓어진다. */
  it("로케일 칩은 하나이고 값이 선택 전체다", () => {
    const chips = activeFilters({ locales: "ko,ja" }, ctx(["ko", "ja"]));
    expect(chips).toEqual([{ key: "locales", value: "ko, ja", next: { locales: undefined } }]);
  });

  it("검색 칩을 낸다", () => {
    const chips = activeFilters({ q: "save" }, ctx(["en", "ko", "ja"]));
    expect(chips).toEqual([{ key: "search", value: "save", next: { q: undefined } }]);
  });

  it("셋이 다 걸리면 셋이 나온다 — 순서는 툴바와 같다", () => {
    const query = { ns: "common", locales: "ko", q: "save" };
    const chips = activeFilters(query, ctx(["ko"]));
    expect(chips.map((c) => c.key)).toEqual(["namespace", "locales", "search"]);
  });

  it("빈 검색어는 칩이 아니다 — 필터를 비운 것은 필터가 없는 것이다", () => {
    expect(activeFilters({ q: "" }, ctx(["en", "ko", "ja"]))).toEqual([]);
    expect(activeFilters({ q: "   " }, ctx(["en", "ko", "ja"]))).toEqual([]);
  });
});

describe("activeFilters — `next`가 나머지를 보존한다", () => {
  const query = { ns: "common", locales: "ko", q: "save" };
  const chips = activeFilters(query, ctx(["ko"]));
  const next = (key: string) => chips.find((c) => c.key === key)?.next;

  it("네임스페이스를 떼면 전체로 넓어지고 나머지가 남는다", () => {
    expect(next("namespace")).toEqual({ ns: "*", locales: "ko", q: "save" });
  });

  /** ⚠️ **`locales: undefined`다** — 빈 문자열을 넣으면 URL에 `?locales=`가 실린다. */
  it("로케일 칩을 떼면 `locales`가 사라진다", () => {
    expect(next("locales")).toEqual({ ns: "common", locales: undefined, q: "save" });
  });

  it("검색 칩을 떼면 `q`가 사라진다", () => {
    expect(next("search")).toEqual({ ns: "common", locales: "ko", q: undefined });
  });

  it("원본 쿼리를 건드리지 않는다 — 호출부가 같은 객체를 다시 쓴다", () => {
    expect(query).toEqual({ ns: "common", locales: "ko", q: "save" });
  });
});

describe("clearedQuery — 초기화 버튼", () => {
  it("칩 셋을 한 번에 뗀다", () => {
    expect(clearedQuery({ ns: "common", locales: "ko", q: "save" })).toEqual({
      ns: "*",
      locales: undefined,
      q: undefined,
    });
  });

  /** ⚠️ 기본 착지는 칩이 아니었다 — 초기화가 그것을 바꾸면 사용자가 보던 곳을 잃는다. */
  it("미지정 네임스페이스는 그대로 둔다", () => {
    expect(clearedQuery({ q: "save" })).toEqual({ ns: undefined, locales: undefined, q: undefined });
  });

  it("이미 전체면 전체 그대로다", () => {
    expect(clearedQuery({ ns: "*" })).toEqual({ ns: "*", locales: undefined, q: undefined });
  });
});
