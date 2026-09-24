import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  appRequest: vi.fn(),
  getInstallationOctokit: vi.fn(),
  auth: vi.fn(),
  created: [] as { appId: string }[],
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
  },
}));

const { probeRepo, createGitClient } = await import("@/lib/github");
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
