import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), request: vi.fn(), options: vi.fn() }));
vi.mock("octokit", () => ({
  App: class { octokit = { auth: mocks.auth }; },
  Octokit: class {
    constructor(options: unknown) { mocks.options(options); }
    request = mocks.request;
  },
}));
const { createGitClient, listBranches, openRepoReader } = await import("@/lib/github");
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

// sec-audit-3 #16 — 읽기 경로도 같은 스코프다. 설치가 여러 리포를 덮어도 읽기 토큰으로 다른 리포에 닿지 않는다.
it("읽기 클라이언트도 저장소 ID 하나로 제한한 설치 토큰을 쓰고, 읽기마다 새로 받지 않는다", async () => {
  mocks.request.mockResolvedValue({ data: { encoding: "base64", content: Buffer.from("{}").toString("base64") } });
  const reader = await openRepoReader("owner", "repo", "10", "42");
  await reader.blob("sha-1");
  await reader.blob("sha-2");
  expect(mocks.auth).toHaveBeenCalledExactlyOnceWith({ type: "installation", installationId: 10, repositoryIds: [42] });
  expect(mocks.options).toHaveBeenCalledExactlyOnceWith({ auth: "scoped-token" });
  expect(mocks.request).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/git/blobs/{file_sha}", { owner: "owner", repo: "repo", file_sha: "sha-1" });
});
it("브랜치 목록도 저장소 ID 하나로 제한한 설치 토큰을 쓴다", async () => {
  mocks.request.mockResolvedValue({ data: [{ name: "main" }] });
  expect(await listBranches("owner", "repo", "10", "42")).toEqual({ status: "ok", names: ["main"], truncated: false });
  expect(mocks.auth).toHaveBeenCalledExactlyOnceWith({ type: "installation", installationId: 10, repositoryIds: [42] });
  expect(mocks.options).toHaveBeenCalledWith({ auth: "scoped-token" });
});
it.each([null, "", "abc", "007"])("고정되지 않은 저장소 ID(%j)로는 읽기 토큰을 받지 않는다", async id => {
  await expect(openRepoReader("owner", "repo", "10", id)).rejects.toThrow();
  expect(await listBranches("owner", "repo", "10", id)).toEqual({ status: "unavailable" });
  expect(mocks.auth).not.toHaveBeenCalled();
});
// 다운로드 예산의 크기는 트리 응답에 이미 있다 — 리더의 `sizes`는 GitHub을 다시 부르지 않고, 크기 없는 경로는 지도에서 뺀다(예산이 거부한다).
it("GitHub 리더의 sizes는 스냅샷의 size를 쓰고 원격 호출 0이다", async () => {
  const reader = await openRepoReader("owner", "repo", "10", "42");
  mocks.request.mockClear();
  const snapshot = { status: "ok" as const, headSha: "h", headCommittedAt: "2026-10-12T00:00:00Z", files: [
    { path: "en.json", sha: "a", size: 20 }, { path: "ko.json", sha: "b" }, { path: "fr.json", sha: "c", size: 5 },
  ] };
  expect(await reader.sizes(snapshot, ["en.json", "ko.json"])).toEqual({ status: "ok", sizes: new Map([["en.json", 20]]) });
  expect(mocks.request).not.toHaveBeenCalled();
});
