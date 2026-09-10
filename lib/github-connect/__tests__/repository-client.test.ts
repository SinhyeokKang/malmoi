import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), request: vi.fn(), options: vi.fn() }));
vi.mock("octokit", () => ({
  App: class { octokit = { auth: mocks.auth }; },
  Octokit: class {
    constructor(options: unknown) { mocks.options(options); }
    request = mocks.request;
  },
}));
const { createGitClient } = await import("@/lib/github");
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "test-key");
  mocks.auth.mockResolvedValue({ token: "scoped-token" });
  mocks.request.mockResolvedValue({ data: { id: 42 } });
});
afterEach(() => vi.unstubAllEnvs());
it("쓰기 클라이언트는 저장소 ID 하나로 제한한 설치 토큰만 쓴다", async () => {
  await createGitClient("owner", "repo", "10", "42");
  expect(mocks.auth).toHaveBeenCalledWith({ type: "installation", installationId: 10, repositoryIds: [42] });
  expect(mocks.options).toHaveBeenCalledWith({ auth: "scoped-token" });
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith("GET /repos/{owner}/{repo}", { owner: "owner", repo: "repo" });
});
it("이름이 재사용됐으면 쓰기 클라이언트를 반환하지 않는다", async () => {
  mocks.request.mockResolvedValue({ data: { id: 43 } });
  await expect(createGitClient("owner", "repo", "10", "42")).rejects.toThrow();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
