import { afterEach, beforeEach, expect, it, vi } from "vitest";

const client = vi.hoisted(() => vi.fn());
vi.mock("@/lib/github", () => ({ createGitClient: client }));
import { loadOpenPrUrl } from "../open-pr";

/**
 * 조회 실패는 `undefined`(모름)로 접혀 화면에서 Dialog 안내가 빠질 뿐이다 — 원인을 볼 곳이 서버 로그 한 줄뿐이다
 * (launch-readiness L5.2). ⚠️ **GitHub 상태 코드는 남기되 메시지는 안 남긴다**(`classifyFailure` 규칙).
 */
const project = { repoOwner: "o", repoName: "r", installationId: "1", repositoryId: "2", archivedAt: null };
let log: { mock: { calls: unknown[][] }; mockRestore: () => void };
beforeEach(() => { log = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => log.mockRestore());

it("GitHub 실패는 상태 코드 한 줄을 남기고 undefined", async () => {
  client.mockRejectedValue(Object.assign(new Error("Bad credentials secret"), { status: 401 }));
  expect(await loadOpenPrUrl("alpha", project)).toBeUndefined();
  expect(log.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/^\[open-pr\] \w{8} find: http-401$/)]);
});

it("성공은 0줄", async () => {
  client.mockResolvedValue({ findOpenPr: async () => ({ url: "https://github.com/o/r/pull/1" }) });
  expect(await loadOpenPrUrl("alpha", project)).toBe("https://github.com/o/r/pull/1");
  client.mockResolvedValue({ findOpenPr: async () => null });
  expect(await loadOpenPrUrl("alpha", project)).toBeNull();
  expect(log).not.toHaveBeenCalled();
});

/**
 * ⚠️ **마감이 probe와 같다** (audit-ux D5) — 설정 화면의 보관 Dialog 안내 하나 때문에 GitHub이 멈춘 날 그 자리가
 * `maxDuration`까지 매달리지 않는다. 마감은 실패와 같은 갈래(`undefined` — "확인하지 못했다")다.
 */
it("GitHub이 응답하지 않으면 마감에서 undefined이고 한 줄을 남긴다", async () => {
  vi.useFakeTimers();
  try {
    client.mockReturnValue(new Promise(() => {}));
    const result = loadOpenPrUrl("alpha", project);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(result).resolves.toBeUndefined();
    expect(log.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/^\[open-pr\] \w{8} deadline: /)]);
  } finally {
    vi.useRealTimers();
  }
});
