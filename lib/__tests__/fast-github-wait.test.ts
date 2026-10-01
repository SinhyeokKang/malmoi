import { afterEach, describe, expect, it, vi } from "vitest";

import { FAST_GITHUB_WAIT_MS, withinGithubWait } from "./fast-github-wait";

/**
 * **짧은 마감 사본도 실물처럼 이긴 쪽 뒤에 `late()`를 부르지 않는다.** 라우트 테스트 둘(`pull-nightly`·`push-open-pr`)이 쓰던 손 사본은
 * 타이머를 끄지 않아, 작업이 이긴 뒤에도 20ms 뒤 `late()`가 돌았다 — `late()`는 `logCaught`로 로그를 쓰므로 파일이 끝난 뒤
 * (`restoreAllMocks`가 진짜 console을 되돌린 뒤) 로그가 나가 vitest가 `EnvironmentTeardownError`로 CI를 red로 만들었다(PR #171).
 */
afterEach(() => {
  vi.useRealTimers();
});

describe("fast withinGithubWait", () => {
  it("작업이 이기면 마감이 지나도 late()를 부르지 않는다", async () => {
    vi.useFakeTimers();
    const late = vi.fn(() => "late");
    await expect(withinGithubWait(Promise.resolve("work"), late)).resolves.toBe("work");
    await vi.advanceTimersByTimeAsync(FAST_GITHUB_WAIT_MS * 5);
    expect(late).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("작업이 마감을 넘기면 late()의 값으로 접는다", async () => {
    vi.useFakeTimers();
    const late = vi.fn(() => "late");
    const result = withinGithubWait(new Promise<string>(() => {}), late);
    await vi.advanceTimersByTimeAsync(FAST_GITHUB_WAIT_MS);
    await expect(result).resolves.toBe("late");
    expect(late).toHaveBeenCalledOnce();
  });

  it("거부는 그대로 던지고 타이머를 남기지 않는다", async () => {
    vi.useFakeTimers();
    const late = vi.fn(() => "late");
    await expect(withinGithubWait(Promise.reject(new Error("boom")), late)).rejects.toThrow("boom");
    await vi.advanceTimersByTimeAsync(FAST_GITHUB_WAIT_MS * 5);
    expect(late).not.toHaveBeenCalled();
  });
});
