import { expect, it } from "vitest";
import { planWorkflowStale } from "../workflow";
it("첫 적재 전 이름만 순서대로 돌려주고 CI 연결을 증명하지 않는다", () => {
  expect(planWorkflowStale([])).toEqual([]);
  expect(planWorkflowStale([{ slug: "web", lastCommitSha: null }, { slug: "server-imported-without-ci", lastCommitSha: "sha" }, { slug: "app", lastCommitSha: null }])).toEqual(["web", "app"]);
});
