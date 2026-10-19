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
  await reader.blob("sha-1", "en.json");
  await reader.blob("sha-2", "en.json");
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

it("UTF-16 blob을 경로로 읽고 Publish는 base64 blob SHA를 트리에 싣는다", async () => {
  const content = '"a" = "안녕";\n';
  const bytes = Buffer.concat([Buffer.from([255, 254]), Buffer.from(content, "utf16le")]);
  const client = await createGitClient("owner", "repo", "10", "42");
  mocks.request.mockImplementation(async (route: string) => {
    if (route.startsWith("GET") && route.includes("/git/blobs/")) return { data: { encoding: "base64", content: bytes.toString("base64") } };
    if (route.startsWith("GET") && route.includes("/git/ref/")) return { data: { object: { sha: "old" } } };
    return { data: { sha: route.endsWith("/blobs") ? "encoded-blob" : "created" } };
  });
  expect(await client.getBlobText("sha", "ko.strings")).toEqual({ content, encoding: "utf-16le-bom" });
  await client.publishSnapshot({ branch: "sync", baseSha: "base", summary: "2 files", changes: [
    { kind: "upsert", path: "ko.strings", content, encoding: "utf-16le-bom", inBase: true },
    { kind: "upsert", path: "en.json", content: "{}", inBase: true },
  ] });
  expect(mocks.request).toHaveBeenCalledWith("POST /repos/{owner}/{repo}/git/blobs", { owner: "owner", repo: "repo", content: bytes.toString("base64"), encoding: "base64" });
  expect(mocks.request).toHaveBeenCalledWith("POST /repos/{owner}/{repo}/git/trees", { owner: "owner", repo: "repo", base_tree: "base", tree: [
    { path: "ko.strings", mode: "100644", type: "blob", sha: "encoded-blob" },
    { path: "en.json", mode: "100644", type: "blob", content: "{}" },
  ] });
});
it("GitHub 적재 리더는 손상 파일을 unreadable로 돌리고 Publish 리더는 오류를 전달한다", async () => {
  const client = await createGitClient("owner", "repo", "10", "42");
  const reader = await openRepoReader("owner", "repo", "10", "42");
  mocks.request.mockResolvedValue({ data: { encoding: "base64", content: Buffer.from("fffe00d8", "hex").toString("base64") } });
  await expect(client.getBlobText("sha", "bad.strings")).rejects.toMatchObject({ code: "parse-failed", path: "bad.strings" });
  await expect(reader.blob("sha", "bad.strings")).resolves.toBeUndefined();
});

it("UTF-8만 Publish하면 blob POST 없이 기존 인라인 트리를 보낸다", async () => {
  const client = await createGitClient("owner", "repo", "10", "42");
  mocks.request.mockImplementation(async (route: string) => route.includes("/git/ref/")
    ? { data: { object: { sha: "old" } } } : { data: { sha: "created" } });
  await client.publishSnapshot({ branch: "sync", baseSha: "base", summary: "1 file", changes: [
    { kind: "upsert", path: "en.json", content: "{}", inBase: true },
  ] });
  expect(mocks.request.mock.calls.filter(([route]) => route === "POST /repos/{owner}/{repo}/git/blobs")).toHaveLength(0);
  expect(mocks.request).toHaveBeenCalledWith("POST /repos/{owner}/{repo}/git/trees", {
    owner: "owner", repo: "repo", base_tree: "base", tree: [{ path: "en.json", mode: "100644", type: "blob", content: "{}" }],
  });
});

vi.mock("@/lib/onboarding-run/access", () => ({ checkRepoAccess: async () => ({ status: "ok", host: "github", repoOwner: "owner", repoName: "repo", installationId: "10", repositoryId: "42", defaultBranch: "main" }) }));
vi.mock("@/lib/repo-host", () => ({ openRepoReader: async () => {
  const { openRepoReader } = await import("@/lib/github");
  return openRepoReader("owner", "repo", "10", "42");
} }));

it("서버 탐지는 실제 리더의 무관한 손상 예제를 건너뛰고 정상 후보를 반환한다", async () => {
  const { detectFormats } = await import("@/lib/onboarding-run/detect");
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  const paths = ["locales/en.json", "locales/ko.json", "locales/ja.json", "examples/by-features/encoding/locales/ko.yml"];
  mocks.request.mockImplementation(async (route: string, args: { file_sha?: string }) => {
    if (route.endsWith("/git/ref/{ref}")) return { data: { object: { sha: "a".repeat(40) } } };
    if (route.endsWith("/git/commits/{commit_sha}")) return { data: { sha: "a".repeat(40), committer: { date: "2026-10-19T00:00:00Z" } } };
    if (route.endsWith("/git/trees/{tree_sha}")) return { data: { truncated: false, tree: paths.map(path => ({ path, sha: path, size: 40, type: "blob", mode: "100644" })) } };
    const bytes = args.file_sha?.endsWith("ko.yml") ? Buffer.from([0xb0, 0xa1]) : Buffer.from('{"hello":"Hello"}');
    return { data: { encoding: "base64", content: bytes.toString("base64") } };
  });
  const result = await detectFormats({} as import("@/generated/prisma/client").PrismaClient, { userId: "user" }, { owner: "owner", repo: "repo" });
  expect(result).toMatchObject({ ok: true, candidates: [expect.objectContaining({ pathTemplate: "locales/{locale}.json" })] });
});
