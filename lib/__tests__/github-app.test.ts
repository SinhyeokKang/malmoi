import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  appRequest: vi.fn(),
  getInstallationOctokit: vi.fn(),
  auth: vi.fn(),
  created: [] as { appId: string }[],
  tokens: [] as unknown[],
}));

vi.mock("octokit", () => ({
  App: class {
    octokit = { request: hoisted.appRequest, auth: hoisted.auth };
    getInstallationOctokit = hoisted.getInstallationOctokit;
    constructor(options: { appId: string }) {
      hoisted.created.push({ appId: options.appId });
    }
  },
  Octokit: class {
    request = hoisted.request;
    constructor(options: { auth?: unknown } = {}) {
      hoisted.tokens.push(options.auth);
    }
  },
}));

const { probeRepo, createGitClient, loadConnectionHealth } = await import("@/lib/github");
const { GITHUB_WAIT_MS } = await import("@/lib/github-wait");

/**
 * GitHub App 인스턴스와 probe 마감 (audit-ux #8).
 *
 * ⚠️ **App이 요청 사이에 살아남아야 설치 토큰 캐시가 산다** — `@octokit/auth-app`의 캐시는 인스턴스에 붙어 있어
 * 호출마다 `new App`이면 설정·Home 진입마다 `POST /app/installations/{id}/access_tokens`가 다시 돈다.
 */
const PEM = "-----BEGIN RSA PRIVATE KEY-----\nx\n-----END RSA PRIVATE KEY-----";
let log: { mock: { calls: unknown[][] }; mockRestore: () => void };

beforeEach(() => {
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", PEM);
  hoisted.created.length = 0;
  hoisted.tokens.length = 0;
  for (const fn of [hoisted.request, hoisted.appRequest, hoisted.getInstallationOctokit, hoisted.auth]) fn.mockReset();
  hoisted.appRequest.mockResolvedValue({ data: { id: 7 } });
  hoisted.getInstallationOctokit.mockResolvedValue({ request: hoisted.request });
  hoisted.request.mockResolvedValue({ data: { id: 9, full_name: "o/r", default_branch: "main" } });
  hoisted.auth.mockResolvedValue({ token: "t" });
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  log.mockRestore();
});

describe("App 인스턴스", () => {
  it("probe를 거듭 불러도, 쓰기 클라이언트를 만들어도 App은 하나다", async () => {
    // 앞선 테스트가 이미 만들었을 수 있다 — 이 테스트 안에서 **새로** 만든 수가 0 또는 1이어야 한다.
    await probeRepo("o", "r");
    await probeRepo("o", "r");
    await createGitClient("o", "r", "7", "9");
    expect(hoisted.created.length).toBeLessThanOrEqual(1);
    await probeRepo("o", "r");
    expect(hoisted.created.length).toBeLessThanOrEqual(1);
  });

  it("자격증명이 바뀌면 새 App이다 — 옛 키로 서명한 JWT를 계속 쓰지 않는다", async () => {
    await probeRepo("o", "r");
    const before = hoisted.created.length;
    vi.stubEnv("GITHUB_APP_ID", "456");
    await probeRepo("o", "r");
    expect(hoisted.created.length).toBe(before + 1);
    expect(hoisted.created.at(-1)).toEqual({ appId: "456" });
  });
});

describe("probeRepo 마감", () => {
  it("GitHub이 응답하지 않으면 마감에서 `error`로 접고 한 줄을 남긴다 — `maxDuration`까지 끌려가지 않는다", async () => {
    vi.useFakeTimers();
    hoisted.appRequest.mockReturnValue(new Promise(() => {}));
    const result = probeRepo("o", "r");
    await vi.advanceTimersByTimeAsync(GITHUB_WAIT_MS);
    await expect(result).resolves.toEqual({ status: "error" });
    expect(log.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/^\[github-connect\] \w{8} probe-deadline: AppError$/)]);
  });

  it("마감 안의 응답은 그대로다", async () => {
    await expect(probeRepo("o", "r")).resolves.toEqual({ status: "ok", installationId: "7", repositoryId: "9", fullName: "o/r", defaultBranch: "main" });
    expect(log).not.toHaveBeenCalled();
  });
});

/**
 * ⚠️ **App이 요청 사이에 남으면 캐시된 설치 토큰이 만료 직전일 수 있다** (U5 리뷰). 캐시 수명이 59분이라 1분 남은
 * 토큰이 나오고, `createGitClient`는 그 토큰을 고정 Octokit에 박는다 — 60초짜리 Publish·야간 pull이 도중에 401이면
 * 브랜치만 밀리고 PR이 안 선다. 5분 안에 끝나는 토큰이면 새로 받는다.
 */
describe("createGitClient 토큰 수명", () => {
  const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

  it("만료가 5분 안이면 `refresh: true`로 새 토큰을 받아 그것을 쓴다", async () => {
    hoisted.auth.mockResolvedValueOnce({ token: "old", expiresAt: inMinutes(1) }).mockResolvedValueOnce({ token: "fresh", expiresAt: inMinutes(60) });
    await createGitClient("o", "r", "7", "9");
    expect(hoisted.auth).toHaveBeenCalledTimes(2);
    expect(hoisted.auth.mock.calls[1]?.[0]).toMatchObject({ type: "installation", installationId: 7, repositoryIds: [9], refresh: true });
    expect(hoisted.tokens).toEqual(["fresh"]);
  });

  it("넉넉히 남았으면 캐시 토큰을 그대로 쓴다 — 발급 왕복을 늘리지 않는다", async () => {
    hoisted.auth.mockResolvedValueOnce({ token: "cached", expiresAt: inMinutes(30) });
    await createGitClient("o", "r", "7", "9");
    expect(hoisted.auth).toHaveBeenCalledTimes(1);
    expect(hoisted.tokens).toEqual(["cached"]);
  });
});

/**
 * **열린 PR만 센다** (nightly-sync 완료 조건 6). 닫힌(머지 안 된) PR은 게이트를 세우지 않는다 — `state: "open"`이 빠지면 GitHub 기본값도
 * open이지만, 그 기본값에 기대면 누가 `state`를 바꾸는 순간 닫힌 PR이 CI·야간 적재를 영구 보류한다.
 */
describe("createGitClient.findOpenPr", () => {
  it("`owner:branch` head와 `state: open`으로 묻는다", async () => {
    const client = await createGitClient("o", "r", "7", "9");
    hoisted.request.mockResolvedValueOnce({ data: [] });
    // 호출부는 브랜치 이름만 넘기고 `owner:branch`는 GitHub 구현이 조립한다 — 브랜치명만 보내면 GitHub이 필터를 조용히 무시한다.
    await expect(client.findOpenPr("malmoi-i18n/sync-acme")).resolves.toBeNull();
    expect(hoisted.request).toHaveBeenLastCalledWith("GET /repos/{owner}/{repo}/pulls", expect.objectContaining({ head: "o:malmoi-i18n/sync-acme", state: "open" }));
  });
});

/**
 * **저장된 것이 판정을 끝내면 GitHub을 치지 않는다** (ux-drift-unify §3.1). 설치가 없거나 리포 id가 없으면
 * `planConnectionHealth`가 probe 결과를 버리므로 App JWT 조회·토큰 발급·리포 조회가 헛돈다.
 */
describe("loadConnectionHealth probe 생략", () => {
  const project = { repoOwner: "o", repoName: "r", installationId: "7", repositoryId: "9" };
  it.each([
    [{ ...project, installationId: null }, "not-connected"],
    [{ ...project, repositoryId: null }, "unpinned"],
    [{ ...project, installationId: null, repositoryId: null }, "not-connected"],
  ] as const)("%o → %s, GitHub 호출 0", async (stored, status) => {
    await expect(loadConnectionHealth(stored)).resolves.toEqual({ status });
    expect(hoisted.appRequest).not.toHaveBeenCalled();
    expect(hoisted.getInstallationOctokit).not.toHaveBeenCalled();
    expect(hoisted.request).not.toHaveBeenCalled();
  });

  it("둘 다 있으면 probe한다", async () => {
    await loadConnectionHealth(project);
    expect(hoisted.appRequest).toHaveBeenCalled();
  });
});

it("getTree preserves Git modes and non-blob paths so Publish cannot recreate unsupported targets", async () => {
  const client = await createGitClient("o", "r", "7", "9");
  const tree = [
    { path: "en.json", sha: "normal", type: "blob", mode: "100644" },
    { path: "ko.json", sha: "link", type: "blob", mode: "120000" },
    { path: "fr.json", sha: "exec", type: "blob", mode: "100755" },
    { path: "de.json", sha: "module", type: "commit", mode: "160000" },
    { path: "es.json", sha: "dir", type: "tree", mode: "040000" },
  ];
  hoisted.request.mockResolvedValue({ data: { truncated: false, tree } });
  expect(await client.getTree("head")).toEqual(tree.map(({ type: _, ...entry }) => entry));
});

it("getTree preserves a missing mode as unknown rather than assuming an ordinary file", async () => {
  const client = await createGitClient("o", "r", "7", "9");
  hoisted.request.mockResolvedValue({ data: { truncated: false, tree: [{ path: "ko.json", sha: "link", type: "blob" }] } });
  expect(await client.getTree("head")).toEqual([{ path: "ko.json", sha: "link", mode: "unknown" }]);
});

it.each([
  { path: "ko.json", type: "blob", mode: "120000" },
  { sha: "link", type: "blob", mode: "120000" },
])("getTree rejects incomplete entries rather than dropping an occupied path", async (entry) => {
  const client = await createGitClient("o", "r", "7", "9");
  hoisted.request.mockResolvedValue({ data: { truncated: false, tree: [entry] } });
  await expect(client.getTree("head")).rejects.toThrow(/incomplete Git tree entry/);
});

it("getTree throws on a truncated tree — a partial tree turns base files into \"new\" files and every blob comparison is wrong", async () => {
  const client = await createGitClient("o", "r", "7", "9");
  hoisted.request.mockResolvedValue({ data: { truncated: true, tree: [] } });
  await expect(client.getTree("head")).rejects.toThrow(/truncated/);
});

/**
 * **`publishSnapshot`의 GitHub 구현** (gitlab-repositories design §3) — Git Data API 네 단계가 경계 안으로 들어왔다. 트리는 `base_tree`가 있어야
 * 리포의 나머지 파일이 남고, 커밋 parent는 base head 하나이며, 메시지에 루프 마커가 든다. sync 브랜치가 없으면 만들고 있으면 강제로 옮긴다.
 */
describe("createGitClient.publishSnapshot", () => {
  const input = { branch: "malmoi-i18n/sync-acme", baseSha: "basehead", changes: [{ path: "i18n/ko.json", content: "{}\n", inBase: true }], summary: "1 file" };
  const routes = () => hoisted.request.mock.calls.map(([route]) => route as string);

  async function publish(syncExists: boolean) {
    const client = await createGitClient("o", "r", "7", "9");
    hoisted.request.mockReset();
    hoisted.request.mockImplementation(async (route: string) => {
      if (route === "POST /repos/{owner}/{repo}/git/trees") return { data: { sha: "tree-sha" } };
      if (route === "POST /repos/{owner}/{repo}/git/commits") return { data: { sha: "commit-sha" } };
      if (route === "GET /repos/{owner}/{repo}/git/ref/{ref}") {
        if (syncExists) return { data: { object: { sha: "old" } } };
        throw Object.assign(new Error("Not Found"), { status: 404 });
      }
      return { data: {} };
    });
    return client.publishSnapshot(input);
  }

  it("sync 브랜치가 없으면 트리 → 커밋 → ref 조회 → ref 생성이고, 커밋 SHA를 돌려준다", async () => {
    await expect(publish(false)).resolves.toBe("commit-sha");
    expect(routes()).toEqual([
      "POST /repos/{owner}/{repo}/git/trees",
      "POST /repos/{owner}/{repo}/git/commits",
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
      "POST /repos/{owner}/{repo}/git/refs",
    ]);
    expect(hoisted.request).toHaveBeenCalledWith("POST /repos/{owner}/{repo}/git/trees", expect.objectContaining({
      base_tree: "basehead", tree: [{ path: "i18n/ko.json", mode: "100644", type: "blob", content: "{}\n" }],
    }));
    const commit = hoisted.request.mock.calls.find(([route]) => route === "POST /repos/{owner}/{repo}/git/commits")?.[1] as { parents: string[]; tree: string; message: string };
    expect(commit.parents).toEqual(["basehead"]);
    expect(commit.tree).toBe("tree-sha");
    expect(commit.message).toContain("[skip-malmoi-i18n]");
    expect(hoisted.request).toHaveBeenCalledWith("POST /repos/{owner}/{repo}/git/refs", expect.objectContaining({ ref: "refs/heads/malmoi-i18n/sync-acme", sha: "commit-sha" }));
  });

  it("sync 브랜치가 있으면 강제로 옮긴다 — 누적 히스토리가 아니라 스냅샷이다", async () => {
    await publish(true);
    expect(routes().at(-1)).toBe("PATCH /repos/{owner}/{repo}/git/refs/{ref}");
    expect(hoisted.request).toHaveBeenLastCalledWith("PATCH /repos/{owner}/{repo}/git/refs/{ref}", expect.objectContaining({ ref: "heads/malmoi-i18n/sync-acme", sha: "commit-sha", force: true }));
  });

  it("resetSyncBranch는 sync 브랜치를 base head로 강제로 옮긴다", async () => {
    const client = await createGitClient("o", "r", "7", "9");
    hoisted.request.mockReset();
    hoisted.request.mockResolvedValue({ data: {} });
    await client.resetSyncBranch("malmoi-i18n/sync-acme", "basehead");
    expect(hoisted.request.mock.calls).toEqual([["PATCH /repos/{owner}/{repo}/git/refs/{ref}", expect.objectContaining({ ref: "heads/malmoi-i18n/sync-acme", sha: "basehead", force: true })]]);
  });
});
