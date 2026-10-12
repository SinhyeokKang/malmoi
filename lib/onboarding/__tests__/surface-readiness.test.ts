import { expect, it } from "vitest";
import { planSurfaceReadiness, planProjectReadiness } from "../readiness";
it("설치가 먼저이고 해당 표면의 SHA만 본다", () => {
  for (const lastCommitSha of [null, "sha"]) {
    expect(planSurfaceReadiness({ connected: false, surface: { lastCommitSha } })).toBe("setup");
    expect(planSurfaceReadiness({ connected: true, surface: { lastCommitSha } })).toBe(lastCommitSha === null ? "awaiting_first_sync" : "ready");
  }
  expect(planProjectReadiness({ repoHost: "github", installationId: "1", repositoryId: "2", surfaces: [] })).toBe("awaiting_first_sync");
});
