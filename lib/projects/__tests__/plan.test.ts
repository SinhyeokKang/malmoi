import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { planProjectName, PROJECT_NAME_MAX_CHARS } from "../plan";
it("생성과 수정의 이름 상한은 200이고 트림 뒤 적용한다", () => {
  expect(PROJECT_NAME_MAX_CHARS).toBe(200);
  expect(planProjectName("  project  ")).toEqual({ ok: true, name: "project" });
  expect(planProjectName(" \n ")).toEqual({ ok: false, reason: "empty" });
  expect(planProjectName("x".repeat(200))).toEqual({ ok: true, name: "x".repeat(200) });
  expect(planProjectName("x".repeat(201))).toEqual({ ok: false, reason: "too-long" });
  // 생성 입력 스키마는 공유 코어로 옮겨졌다(mcp-connector T4-d) — 웹과 MCP `create_project`가 같은 상한을 지난다.
  expect(readFileSync("lib/onboarding-run/create.ts", "utf8")).toContain(".max(PROJECT_NAME_MAX_CHARS)");
});
