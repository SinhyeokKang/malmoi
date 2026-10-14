import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **경계 계약의 GitHub 쪽 공백** (gitlab-repositories design §3 · R-A ⚪8). GitLab 계약(`lib/gitlab/__tests__/client.test.ts`·`publish.test.ts`)과 대칭인 줄을
 * GitHub 구현에도 한 줄씩 둔다 — 잘린 트리는 던진다 · 열린 PR은 `owner:branch` 필터의 첫 행이다 · 스냅샷 발행이 중간에 실패하면 ref가 안 움직인다.
 */

const mocks = vi.hoisted(() => ({ auth: vi.fn(), request: vi.fn() }));
vi.mock("octokit", () => ({
  App: class { octokit = { auth: mocks.auth }; },
  Octokit: class { request = mocks.request; },
}));
const { createGitClient } = await import("@/lib/github");

type Handler = (route: string, params: Record<string, unknown>) => unknown;
function serve(handler: Handler) {
  mocks.request.mockImplementation(async (route: string, params: Record<string, unknown>) => ({ data: await handler(route, params) }));
}
const routes = () => mocks.request.mock.calls.map(([route]) => route as string);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "test-key");
  mocks.auth.mockResolvedValue({ token: "scoped-token" });
});

describe("GitHub GitClient — GitLab 계약과 대칭인 줄", () => {
  it("getTree: truncated면 던진다 — 부분 트리로 blob 비교를 하지 않는다(GitLab은 keyset 상한에서 같은 문장)", async () => {
    serve((route) => (route === "GET /repos/{owner}/{repo}" ? { id: 42 } : { truncated: true, tree: [] }));
    const client = await createGitClient("o", "r", "10", "42");
    await expect(client.getTree("sha")).rejects.toThrow(/truncated/);
  });

  it("findOpenPr: `owner:branch` + open 필터의 첫 행이다 — 페이지를 넘기지 않는다(sync 브랜치 하나에 열린 PR은 GitHub이 하나만 허용한다)", async () => {
    serve((route) => (route === "GET /repos/{owner}/{repo}" ? { id: 42 }
      : [{ html_url: "https://github.com/o/r/pull/2", number: 2, title: "t", base: { ref: "main" } }, { html_url: "https://github.com/o/r/pull/9", number: 9, title: "t", base: { ref: "main" } }]));
    const client = await createGitClient("o", "r", "10", "42");
    expect(await client.findOpenPr("malmoi-i18n/sync-app")).toEqual({ url: "https://github.com/o/r/pull/2", number: 2, title: "t", base: "main", body: "" });
    const list = mocks.request.mock.calls.find(([route]) => route === "GET /repos/{owner}/{repo}/pulls");
    expect(list?.[1]).toEqual({ owner: "o", repo: "r", head: "o:malmoi-i18n/sync-app", state: "open" });
  });

  it("⚠️ publishSnapshot: 트리 성공 · 커밋 실패면 ref를 만들거나 옮기지 않는다 — 브랜치는 이전 스냅샷 그대로다(GitLab은 커밋 API 한 번이라 중간이 없다)", async () => {
    serve((route) => {
      if (route === "GET /repos/{owner}/{repo}") return { id: 42 };
      if (route === "POST /repos/{owner}/{repo}/git/trees") return { sha: "tree-sha" };
      if (route === "POST /repos/{owner}/{repo}/git/commits") throw Object.assign(new Error("boom"), { status: 502 });
      throw new Error(`unexpected ${route}`);
    });
    const client = await createGitClient("o", "r", "10", "42");
    await expect(client.publishSnapshot({ branch: "malmoi-i18n/sync-app", baseSha: "base", summary: "1 file", changes: [{ kind: "upsert", path: "ko.json", content: "{}", inBase: true }] })).rejects.toThrow();
    expect(routes()).toEqual(["GET /repos/{owner}/{repo}", "POST /repos/{owner}/{repo}/git/trees", "POST /repos/{owner}/{repo}/git/commits"]);
    expect(routes().some((route) => route.includes("/git/refs") || route.includes("/git/ref/"))).toBe(false);
  });
});
