import { describe, expect, it } from "vitest";

import { jsonWithinBounds } from "../json-bounds";

/**
 * **`placeholders` 상한** (sec-audit-3 발견 18). 값은 해석하지 않고 나르는 계약이라 모양을 검사하지 않는다 —
 * 여기서 거는 것은 **자원**(깊이·직렬화 크기)이다. 크롬 블록은 `{name:{content,example}}`, 깊이 2다.
 */
const nest = (depth: number, leaf: unknown = "x"): unknown => {
  let v: unknown = leaf;
  for (let i = 0; i < depth; i++) v = i % 2 === 0 ? { a: v } : [v];
  return v;
};
const BOUNDS = { maxDepth: 8, maxBytes: 16_384 };

describe("jsonWithinBounds — 깊이", () => {
  it("스칼라·빈 컨테이너는 통과한다", () => {
    for (const v of [undefined, null, "x", 1, true, {}, []]) expect(jsonWithinBounds(v, BOUNDS)).toBe(true);
  });

  it("크롬 placeholders 블록은 통과한다 — 깊이 2다", () => {
    const chrome = { name: { content: "$1", example: "Kim" }, count: { content: "$2" } };
    expect(jsonWithinBounds(chrome, BOUNDS)).toBe(true);
  });

  it("깊이 8은 통과하고 9는 거부한다 — 객체·배열 둘 다 센다", () => {
    expect(jsonWithinBounds(nest(8), BOUNDS)).toBe(true);
    expect(jsonWithinBounds(nest(9), BOUNDS)).toBe(false);
  });

  it("형제가 아니라 가장 깊은 가지로 잰다", () => {
    expect(jsonWithinBounds({ shallow: 1, deep: nest(8) }, BOUNDS)).toBe(false);
  });

  it("아주 깊은 값에서도 스택을 넘기지 않는다 — 순회가 재귀가 아니다", () => {
    expect(() => jsonWithinBounds(nest(200_000), BOUNDS)).not.toThrow();
    expect(jsonWithinBounds(nest(200_000), BOUNDS)).toBe(false);
  });
});

describe("jsonWithinBounds — 크기", () => {
  it("직렬화 UTF-8 바이트로 잰다 — 문자 수가 아니다", () => {
    // `{"a":"…"}` = 8바이트 + 본문.
    expect(jsonWithinBounds({ a: "x".repeat(16_376) }, BOUNDS)).toBe(true);
    expect(jsonWithinBounds({ a: "x".repeat(16_377) }, BOUNDS)).toBe(false);
    expect(jsonWithinBounds({ a: "가".repeat(5_500) }, BOUNDS)).toBe(false);
  });
});
