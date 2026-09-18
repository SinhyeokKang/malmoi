import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  getInstallationOctokit: vi.fn(),
  appCalls: { count: 0 },
}));

vi.mock("octokit", () => ({
  App: class {
    constructor() {
      hoisted.appCalls.count += 1;
    }
    getInstallationOctokit = hoisted.getInstallationOctokit;
  },
  Octokit: class {},
}));

const { listBranches } = await import("@/lib/github");
const { MissingEnvError } = await import("@/lib/failure");

/**
 * ①의 브랜치 목록 (DESIGN §6.7).
 *
 * ⚠️ **층을 `lib/`에 맞춰 끊는다** — Action(`listRepoBranches`)은 `app/(edit)/__tests__/onboarding.test.ts`가
 * 보고, 여기는 GitHub 껍데기만 본다. 선례가 `lib/__tests__/github-probe.test.ts`다.
 *
 * ⚠️ **`release/2.0`을 맨값으로 넘긴다** — octokit이 이미 경로 파라미터를 인코딩하므로 우리가 또 하면
 * 조용한 404다 (POSTMORTEM 2026-09-01).
 */
const page = (names: string[]) => ({ data: names.map((name) => ({ name })) });

beforeEach(() => {
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "-----BEGIN RSA PRIVATE KEY-----\nx\n-----END RSA PRIVATE KEY-----");
  hoisted.appCalls.count = 0;
  hoisted.request.mockReset();
  hoisted.getInstallationOctokit.mockReset();
  hoisted.getInstallationOctokit.mockResolvedValue({ request: hoisted.request });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("listBranches — 브랜치 목록 껍데기", () => {
  it("한 페이지면 그대로 낸다", async () => {
    hoisted.request.mockResolvedValueOnce(page(["main", "develop"]));

    expect(await listBranches("acme", "web", "77")).toEqual({
      status: "ok",
      names: ["main", "develop"],
      truncated: false,
    });
  });

  it("페이지가 가득 차면 다음 페이지를 이어 붙인다", async () => {
    const first = Array.from({ length: 100 }, (_, i) => `b${i}`);
    hoisted.request.mockResolvedValueOnce(page(first)).mockResolvedValueOnce(page(["tail"]));

    const result = await listBranches("acme", "web", "77");

    expect(result).toEqual({ status: "ok", names: [...first, "tail"], truncated: false });
    expect(hoisted.request).toHaveBeenCalledTimes(2);
    expect(hoisted.request.mock.calls[1]?.[1]).toMatchObject({ page: 2, per_page: 100 });
  });

  it("3페이지에서 끊고 `truncated: true`다 — 300개를 넘으면 목록이 답이 아니다", async () => {
    const full = Array.from({ length: 100 }, (_, i) => `b${i}`);
    hoisted.request.mockResolvedValue(page(full));

    const result = await listBranches("acme", "web", "77");

    expect(hoisted.request).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ status: "ok", names: Array.from({ length: 300 }, (_, i) => `b${i % 100}`), truncated: true });
  });

  it("`createApp()`을 한 번만 부른다 — 호출마다 부르면 설치 토큰 발급이 그만큼 는다", async () => {
    hoisted.request.mockResolvedValueOnce(page(["main"]));

    await listBranches("acme", "web", "77");

    expect(hoisted.appCalls.count).toBe(1);
    expect(hoisted.getInstallationOctokit).toHaveBeenCalledWith(77);
  });

  it("GitHub 실패는 값이다 — ①을 막지 않는다 (예외 D)", async () => {
    hoisted.request.mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 500 }));

    expect(await listBranches("acme", "web", "77")).toEqual({ status: "unavailable" });
  });

  it("404도 값이다 — 권한 없는 리소스에도 404가 오므로 '브랜치가 없다'로 단정하지 않는다", async () => {
    hoisted.request.mockRejectedValueOnce(Object.assign(new Error("nope"), { status: 404 }));

    expect(await listBranches("acme", "web", "77")).toEqual({ status: "unavailable" });
  });

  it("환경변수 누락은 **던진다** — 설정 오류를 '잠시 뒤 다시'로 위장하지 않는다", async () => {
    vi.stubEnv("GITHUB_APP_ID", "");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "");

    await expect(listBranches("acme", "web", "77")).rejects.toBeInstanceOf(MissingEnvError);
  });

  it("`/`가 든 이름을 이중 인코딩 없이 그대로 낸다 (POSTMORTEM 2026-09-01)", async () => {
    hoisted.request.mockResolvedValueOnce(page(["release/2.0"]));

    const result = await listBranches("acme", "web", "77");

    expect(result).toEqual({ status: "ok", names: ["release/2.0"], truncated: false });
  });
});
