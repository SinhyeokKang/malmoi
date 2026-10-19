import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), request: vi.fn() }));
vi.mock("octokit", () => ({
  App: class { octokit = { auth: mocks.auth }; },
  Octokit: class { request = mocks.request; },
}));
const { createGitClient } = await import("@/lib/github");

const BLOBS = "POST /repos/{owner}/{repo}/git/blobs";
const TREES = "POST /repos/{owner}/{repo}/git/trees";
const LIMIT = 8;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "test-key");
  mocks.auth.mockResolvedValue({ token: "scoped-token" });
  mocks.request.mockResolvedValue({ data: { id: 42 } });
});
afterEach(() => vi.unstubAllEnvs());

const utf16 = (n: number) => Array.from({ length: n }, (_, i) => ({
  kind: "upsert" as const, path: `L${i}.lproj/Localizable.strings`, content: `"k" = "v${i}";\n`, encoding: "utf-16le-bom" as const, inBase: true,
}));

/** 블롭 응답을 뒤섞인 순서로 끝내 완료 순서가 입력 순서와 다르게 만든다. */
function installFake(opts: { failOn?: string } = {}) {
  const stats = { inFlight: 0, max: 0, posted: 0 };
  mocks.request.mockImplementation(async (route: string, params: { content?: string }) => {
    if (route === "GET /repos/{owner}/{repo}") return { data: { id: 42 } };
    if (route.includes("/git/ref/")) return { data: { object: { sha: "old" } } };
    if (route !== BLOBS) return { data: { sha: "created" } };
    stats.inFlight += 1;
    stats.max = Math.max(stats.max, stats.inFlight);
    const id = Buffer.from(params.content ?? "", "base64").toString("utf16le");
    const n = Number(/v(\d+)/.exec(id)?.[1]);
    await new Promise((r) => setTimeout(r, (n % 3) * 5 + 1));
    stats.inFlight -= 1;
    if (opts.failOn !== undefined && id.includes(opts.failOn)) throw new Error("boom");
    stats.posted += 1;
    return { data: { sha: `blob-${n}` } };
  });
  return stats;
}

const publish = async (changes: ReturnType<typeof utf16>) => {
  const client = await createGitClient("owner", "repo", "10", "42");
  return client.publishSnapshot({ branch: "sync", baseSha: "base", summary: "s", changes });
};

it("UTF-16 blob POST는 한도(8)를 넘지 않는 선에서 실제로 병렬이다", async () => {
  const stats = installFake();
  await publish(utf16(30));
  expect(stats.posted).toBe(30);
  expect(stats.max).toBeGreaterThan(1);
  expect(stats.max).toBeLessThanOrEqual(LIMIT);
});

it("완료 순서와 무관하게 트리 항목은 입력 순서·해당 SHA를 유지한다", async () => {
  installFake();
  const changes = [...utf16(12).slice(0, 6), { kind: "upsert" as const, path: "en.json", content: "{}", inBase: true }, ...utf16(12).slice(6)] as ReturnType<typeof utf16>;
  await publish(changes);
  const tree = mocks.request.mock.calls.find(([r]) => r === TREES)?.[1].tree as Array<{ path: string; sha?: string; content?: string }>;
  expect(tree.map((e) => e.path)).toEqual(changes.map((c) => c.path));
  tree.forEach((e) => {
    if (e.path === "en.json") return expect(e).toEqual({ path: "en.json", mode: "100644", type: "blob", content: "{}" });
    const n = Number(/L(\d+)\.lproj/.exec(e.path)?.[1]);
    expect(e.sha).toBe(`blob-${n}`);
  });
});

it("blob 하나가 실패하면 같은 오류로 전체가 실패하고 트리·커밋을 만들지 않는다", async () => {
  installFake({ failOn: "v5" });
  await expect(publish(utf16(20))).rejects.toThrow("boom");
  expect(mocks.request.mock.calls.filter(([r]) => r === TREES)).toHaveLength(0);
});
