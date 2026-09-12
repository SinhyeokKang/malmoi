import { expect, it } from "vitest";
import { firstQueryValue, firstQueryValues } from "@/lib/search-params";
it("단일 값은 유지하고 반복 파라미터는 첫 값을 쓴다", () => {
  expect(firstQueryValue("a")).toBe("a");
  expect(firstQueryValue(["a", "b"])).toBe("a");
  expect(firstQueryValue(["", "b"])).toBe("");
  expect(firstQueryValue([])).toBeUndefined();
  expect(firstQueryValue(undefined)).toBeUndefined();
});

it("객체 전체를 한 번에 정규화한다 — 화면마다 필드를 세지 않는다", () => {
  expect(firstQueryValues({ ns: ["a", "b"], q: "hello", locales: undefined })).toEqual({
    ns: "a",
    q: "hello",
    locales: undefined,
  });
});

/**
 * ⚠️ **키를 주소창이 정한다** — `?__proto__=x`가 평범한 `{}`에 대입되면 setter가 불려 own property가
 * 안 생기고 그 키가 **조용히 사라진다** (CLAUDE.md 코드 컨벤션, sec-audit 발견 1·17).
 */
it("프로토타입 키를 실제 필드로 받는다", () => {
  const out = firstQueryValues({ ["__proto__"]: "x", constructor: ["y"] } as Record<string, string | string[]>);
  expect(Object.hasOwn(out, "__proto__")).toBe(true);
  expect(out["__proto__"]).toBe("x");
  expect(out["constructor"]).toBe("y");
  expect(Object.getPrototypeOf(out)).toBeNull();
});
