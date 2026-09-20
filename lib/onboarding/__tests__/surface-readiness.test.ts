import { expect, it } from "vitest";
import { planSurfaceReadiness, planProjectReadiness } from "../readiness";
it("설치가 먼저이고 해당 표면의 SHA만 본다", () => {
  for (const lastCommitSha of [null, "sha"]) {
    expect(planSurfaceReadiness({ installationId: null, surface: { lastCommitSha } })).toBe("setup");
    expect(planSurfaceReadiness({ installationId: "1", surface: { lastCommitSha } })).toBe(lastCommitSha === null ? "awaiting_first_sync" : "ready");
  }
  expect(planProjectReadiness({ installationId: "1", surfaces: [] })).toBe("awaiting_first_sync");
});
