import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { en } from "@/messages/en";

import type { ApiTokenSubject } from "../../token-store";

/**
 * **`APP_SIGNING_SECRET`이 비면 탐지는 장애다** (mcp-connector T6 — design §2.2). 확인값 서명(`signSampleConfirmation`)이 던지고 도구가
 * `unavailable`로 접는다 — `no-candidates`(브라우저의 수동 설정으로 보냄)나 `sample-expired`로 접으면 설정 오류가 사용자 할 일로 둔갑한다.
 * 실제 탐지 코어를 지난다 — GitHub과 리포 접근 확인만 가짜다. 대조: 비밀값이 있으면 후보와 확인값이 나온다.
 */
const CATALOG = '{"hello":"Hello"}';
vi.mock("server-only", () => ({}));
vi.mock("@/lib/onboarding-run/access", () => ({
  checkRepoAccess: async () => ({ status: "ok", repositoryId: "100", installationId: "1", repoOwner: "o", repoName: "r", defaultBranch: "main", connect: {} }),
}));
vi.mock("@/lib/github", async (orig) => ({
  ...(await orig<object>()),
  openRepoReader: async () => ({
    snapshot: async () => ({ status: "ok", headSha: "a".repeat(40), headCommittedAt: "2026-09-28T00:00:00Z",
      files: ["i18n/en.json", "i18n/ko.json"].map(path => ({ path, sha: path, size: 20 })) }),
    blob: async () => CATALOG,
  }),
}));

const { executeTool } = await import("../execute");
const { TOOLS } = await import("..");
const detect = TOOLS.find(t => t.name === "detect_formats")!;
const subject: ApiTokenSubject = { userId: "u1", grants: ["project:create"], scope: { kind: "all" }, credential: { kind: "api-token", tokenHash: "hash" } };
const context = () => ({ prisma: {} as never, subject, now: new Date(), origin: null });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); });

it("비밀값이 비면 unavailable · retryable — 후보 없음·만료로 접지 않는다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "");
  const result = await executeTool(detect, context, { owner: "o", repo: "r" });
  expect(result).toEqual({ isError: true, content: [{ type: "text", text: en.errors.access.unavailable }], structuredContent: { status: "unavailable", message: en.errors.access.unavailable, retryable: true } });
});

it("대조: 비밀값이 있으면 후보와 확인값을 준다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(64));
  const result = await executeTool(detect, context, { owner: "o", repo: "r" });
  expect(result.isError).toBe(false);
  expect(result.structuredContent.candidates).toEqual([expect.objectContaining({ adapter: "json-catalog", confirmation: expect.any(String) })]);
});
