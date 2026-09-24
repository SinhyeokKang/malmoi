import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GITHUB_WAIT_MS, withinGithubWait } from "@/lib/github-wait";

/**
 * GitHub 대기 마감 (audit-ux D5). **같은 원격을 기다리는 화면들이 같은 마감을 읽는다** — 목록의 원격 신호가
 * 8초에서 포기하는데 설정·Home의 연결 확인이 60초를 기다리면 한 화면은 "확인 못 함", 다른 화면은 아직
 * 매달린 채다.
 */
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("withinGithubWait", () => {
  it("마감 전에 끝나면 그 값이고 타이머를 남기지 않는다", async () => {
    const late = vi.fn(() => "late");
    await expect(withinGithubWait(Promise.resolve("ok"), late)).resolves.toBe("ok");
    expect(late).not.toHaveBeenCalled();
    // 타이머가 남으면 함수가 마감만큼 늦게 끝난다 (`remote.ts`의 `withDeadline`과 같은 함정).
    expect(vi.getTimerCount()).toBe(0);
  });

  it("응답이 없으면 정확히 마감에서 `late()`의 값으로 접는다", async () => {
    const late = vi.fn(() => "late");
    const result = withinGithubWait(new Promise<string>(() => {}), late);
    await vi.advanceTimersByTimeAsync(GITHUB_WAIT_MS - 1);
    expect(late).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("late");
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("거부는 접지 않고 그대로 던진다 — 분류는 호출부가 한다", async () => {
    const boom = new Error("boom");
    await expect(withinGithubWait(Promise.reject(boom), () => "late")).rejects.toBe(boom);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("마감 값은 하나다", () => {
  it("목록의 원격 신호와 같은 8초다", () => {
    expect(GITHUB_WAIT_MS).toBe(8_000);
  });

  /** ⚠️ 사본 둘이면 다시 갈린다 — `remote.ts`가 숫자를 따로 들지 않고 이 상수를 읽는다. */
  it("`lib/projects/remote.ts`가 같은 상수를 읽는다", () => {
    const src = readFileSync(join(process.cwd(), "lib/projects/remote.ts"), "utf8");
    expect(src).toMatch(/import \{[^}]*\bGITHUB_WAIT_MS\b[^}]*\} from "@\/lib\/github-wait"/);
    expect(src).not.toMatch(/DEADLINE_MS\s*=\s*\d/);
  });
});
