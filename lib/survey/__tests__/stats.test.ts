import { expect, it } from "vitest";
import { median } from "../stats";

// launch-readiness L4.8 — `summarize`·`surveyOne`이 함께 쓰는데 직접 테스트가 없었다.
it("빈 배열은 0이 아니라 undefined다 — 0으로 내면 '측정값 0'과 구별되지 않는다", () => {
  expect(median([])).toBeUndefined();
});

it.each([
  [[3], 3],
  [[3, 1, 2], 2],
  [[4, 1, 3, 2], 2.5],
  [[0, 0, 1], 0],
  [[10, 2], 6],
])("%j의 중앙값은 %d다 — 문자열 정렬이 아니라 수 정렬이다", (xs, expected) => {
  expect(median(xs)).toBe(expected);
});

it("입력을 바꾸지 않는다", () => {
  const xs = [3, 1, 2];
  median(xs);
  expect(xs).toEqual([3, 1, 2]);
});
