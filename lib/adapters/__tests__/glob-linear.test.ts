import { expect, it } from "vitest";
import { matchesGlob } from "../glob";
it("별표는 슬래시를 넘지 않으며 나머지 문자는 리터럴이다", () => {
  expect(matchesGlob("a/*.ts", "a/x.ts")).toBe(true);
  expect(matchesGlob("a/*.ts", "a/b/x.ts")).toBe(false);
  expect(matchesGlob("a/?.ts", "a/x.ts")).toBe(false);
  expect(matchesGlob("a/?.ts", "a/?.ts")).toBe(true);
  expect(matchesGlob("*.ts", ".ts")).toBe(true);
});
it("인접·분리된 별표가 긴 불일치 경로에서 조합 탐색을 하지 않는다", () => {
  expect(matchesGlob("****b.ts", "a".repeat(100000) + ".ts")).toBe(false);
  expect(matchesGlob("*a*a*a*b.ts", "a".repeat(100000) + ".ts")).toBe(false);
});
