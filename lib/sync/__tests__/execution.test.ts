import { afterEach, expect, it, vi } from "vitest";
import { createPublishExecution, planPublishBarrier, publishExecutionWindow } from "../execution";

afterEach(() => vi.useRealTimers());

it.each([239999, 240000, 240001])("작업 예산 경계 %i", elapsed => {
  expect(publishExecutionWindow({ startedAt: new Date(0), now: new Date(elapsed), elapsed })).toBe(Math.max(0, 240000 - elapsed));
});
it("벽시계 역행은 단조 예산을 늘리지 않고 순행은 기한을 당긴다", () => {
  expect(publishExecutionWindow({ startedAt: new Date(0), now: new Date(-1000), elapsed: 240000 })).toBe(0);
  expect(publishExecutionWindow({ startedAt: new Date(0), now: new Date(240000), elapsed: 1 })).toBe(0);
});
it.each([299999, 300000, 300001])("결과 미확인 실패는 시작 후 300초 정각까지 막는다: %i", elapsed => {
  expect(planPublishBarrier({ status: "FAILED", errorCode: "execution-uncertain", startedAt: new Date(0) }, new Date(elapsed))).toBe(elapsed <= 300000 ? "uncertain" : null);
});
it("리포 요청 전 실패는 재실행을 막지 않는다", () => {
  expect(planPublishBarrier({ status: "FAILED", errorCode: "github-error", startedAt: new Date(0) }, new Date(100))).toBeNull();
});
it("만료된 비동기 재개는 새 mutation을 전송하지 못한다", async () => {
  vi.useFakeTimers();
  const execution = createPublishExecution();
  let resume!: () => void;
  const sent = vi.fn();
  const work = execution.run(async () => {
    await new Promise<void>(resolve => { resume = resolve; });
    execution.check();
    sent();
  });
  const rejected = expect(work).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(240000);
  await rejected;
  resume();
  await Promise.resolve();
  expect(sent).not.toHaveBeenCalled();
  expect(() => execution.check()).toThrow();
});
it("body 소비도 예산에 포함하고 전달한 caller signal을 보존한다", async () => {
  vi.useFakeTimers();
  const execution = createPublishExecution();
  const caller = new AbortController();
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    expect(init?.signal?.aborted).toBe(false);
    return new Response(new ReadableStream({ start() {} }));
  });
  const work = execution.run(() => execution.fetch(fetcher)("https://api.github.com/repos/a/b/git/refs/heads/x", { method: "PATCH", signal: caller.signal }));
  const rejected = expect(work).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(240000);
  await rejected;
  expect(execution.mutationDispatched).toBe(true);
  expect(() => execution.check()).toThrow();
});
it("종료 뒤에는 transport가 다시 불려도 전송하지 않는다", async () => {
  const execution = createPublishExecution();
  execution.close();
  const fetcher = vi.fn<typeof fetch>();
  await expect(execution.fetch(fetcher)("https://api.github.com/repos/a/b", { method: "GET" })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("실패 분류는 mutation 시도 여부로만 결과 미확인으로 바뀐다", async () => {
  const { planPublishFailure } = await import("../execution");
  expect(planPublishFailure("db-unavailable", false)).toBe("db-unavailable");
  expect(planPublishFailure("db-unavailable", true)).toBe("execution-uncertain");
  expect(planPublishFailure("github-error", true)).toBe("execution-uncertain");
});
it("타이머가 밀려도 작업 반환 시점의 절대 기한을 다시 검사한다", async () => {
  vi.useFakeTimers();
  const execution = createPublishExecution();
  await expect(execution.run(async () => {
    vi.setSystemTime(Date.now() + 240000);
    return "late";
  })).rejects.toThrow();
});
