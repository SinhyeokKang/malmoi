import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { planProjectName, PROJECT_NAME_MAX_CHARS } from "../plan";
it("생성과 수정의 이름 상한은 200이고 트림 뒤 적용한다", () => {
  expect(PROJECT_NAME_MAX_CHARS).toBe(200);
  expect(planProjectName("  project  ")).toEqual({ ok: true, name: "project" });
  expect(planProjectName(" \n ")).toEqual({ ok: false, reason: "empty" });
  expect(planProjectName("x".repeat(200))).toEqual({ ok: true, name: "x".repeat(200) });
  expect(planProjectName("x".repeat(201))).toEqual({ ok: false, reason: "too-long" });
  expect(readFileSync("app/(edit)/projects/actions.ts", "utf8")).toContain(".max(PROJECT_NAME_MAX_CHARS)");
});
