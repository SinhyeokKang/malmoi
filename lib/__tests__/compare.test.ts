import { expect, it } from "vitest";
import { compareCodeUnits } from "../compare";

/** 코드 유닛 순서 — `localeCompare`와 답이 다른 자리가 이 함수의 존재 이유다 (ARCHITECTURE §1.1). */
it("대문자·밑줄·숫자·비ASCII를 코드 유닛 순으로 세우고, 숫자는 크기로 비교한다", () => {
  expect(["a", "A", "ä", "_x", "B", "b", "1"].sort(compareCodeUnits)).toEqual(["1", "A", "B", "_x", "a", "b", "ä"]);
  expect([10, 2, 1].sort(compareCodeUnits)).toEqual([1, 2, 10]);
  expect(compareCodeUnits("x", "x")).toBe(0);
});
