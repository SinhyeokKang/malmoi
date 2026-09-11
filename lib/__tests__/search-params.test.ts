import { expect, it } from "vitest";
import { firstQueryValue } from "@/lib/search-params";
it("단일 값은 유지하고 반복 파라미터는 첫 값을 쓴다", () => {
  expect(firstQueryValue("a")).toBe("a");
  expect(firstQueryValue(["a", "b"])).toBe("a");
  expect(firstQueryValue(["", "b"])).toBe("");
  expect(firstQueryValue([])).toBeUndefined();
  expect(firstQueryValue(undefined)).toBeUndefined();
});
