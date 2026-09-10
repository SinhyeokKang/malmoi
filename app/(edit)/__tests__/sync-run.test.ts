import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STALE_AFTER_SECONDS } from "@/lib/sync/plan";

import { createHarness, type Seed } from "./harness";

/**
 * **`runSync` — 게이트·행·잠금의 껍데기** (`docs/features/sync-runs/design.md` §3·§5).
 *
 * ⚠️ **동시성을 `Promise.all`로 재지 않는다.** 하네스의 `$transaction`은 직렬화가 없고
 * `$executeRaw`는 no-op이라, 그렇게 재면 **하네스가 실제보다 관대해서** 통과하는 것인지
 * 코드가 옳은 것인지 구별할 수 없다 (POSTMORTEM 2026-09-05). 대신 `triggerPull`을 deferred로
 * 붙들어 **첫 실행이 RUNNING 행을 만든 상태**를 만들고 그 위에서 둘째 호출을 잰다. 진짜 행
 * 잠금은 `[manual]` 실물 검증의 몫이고, 여기서 고정하는 것은 **잠금 SQL이 행 생성보다 앞에
 * 있다**는 배선이다.
 */

const hoisted = vi.hoisted(() => ({ triggerPull: vi.fn() }));
vi.mock("@/lib/pull/trigger", () => ({ triggerPull: hoisted.triggerPull }));

const { runSync } = await import("@/lib/sync/run");

const NOW = new Date("2026-09-10T12:00:00.000Z");
const COMMITTED = {
  status: "committed" as const,
  pr: "created" as const,
  commitSha: "abc",
  prUrl: "https://github.com/o/r/pull/9",
  changed: ["i18n/ko.json"],
};

function harness(seed: Seed = {}) {
  return createHarness({ projects: [{ id: "p1", slug: "acme" }], ...seed });
}

/** `now`에서 `seconds`만큼 과거. */
function ago(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  hoisted.triggerPull.mockReset();
  hoisted.triggerPull.mockResolvedValue(COMMITTED);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runSync — 한 번의 실행이 행 하나를 열고 닫는다", () => {
  it("게이트를 지나면 RUNNING 행 → triggerPull → 닫기가 한 번씩이다", async () => {
    const h = harness();
    const outcome = await runSync(h.prisma, {
      projectId: "p1",
      slug: "acme",
      trigger: "manual",
      requestedBy: "u1",
    });

    expect(outcome).toEqual(COMMITTED);
    expect(h.spies.createSyncRun).toHaveBeenCalledTimes(1);
    expect(hoisted.triggerPull).toHaveBeenCalledTimes(1);
    expect(h.spies.updateSyncRun).toHaveBeenCalledTimes(1);
    expect(h.syncRuns).toHaveLength(1);
    expect(h.syncRuns[0]).toMatchObject({
      projectId: "p1",
      status: "SUCCEEDED",
      trigger: "MANUAL",
      requestedBy: "u1",
      prUrl: COMMITTED.prUrl,
      changed: 1,
      warnings: 0,
      errorCode: null,
    });
  });

  it("cron은 trigger가 CRON이고 requestedBy가 null이다", async () => {
    const h = harness();
    await runSync(h.prisma, { projectId: "p1", slug: "acme", trigger: "cron", requestedBy: null });
    expect(h.syncRuns[0]).toMatchObject({ trigger: "CRON", requestedBy: null });
  });

  it("skipped는 SKIPPED로 남는다 — SUCCEEDED로 접히지 않는다", async () => {
    const h = harness();
    hoisted.triggerPull.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    const outcome = await runSync(h.prisma, {
      projectId: "p1", slug: "acme", trigger: "cron", requestedBy: null,
    });
    expect(outcome).toEqual({ status: "skipped", reason: "no-edits" });
    expect(h.syncRuns[0]).toMatchObject({ status: "SKIPPED", changed: 0, prUrl: null });
  });

  it("던지면 FAILED로 닫고 코드를 남긴다 — 밖으로 던지지 않는다", async () => {
    const h = harness();
    const { fail } = await import("@/lib/failure");
    hoisted.triggerPull.mockImplementation(async () => fail("no install", "not-installed"));

    const outcome = await runSync(h.prisma, {
      projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u1",
    });
    expect(outcome).toEqual({ status: "failed", error: "no install" });
    expect(h.syncRuns[0]).toMatchObject({ status: "FAILED", errorCode: "not-installed", changed: null });
  });

  it("⚠️ 남의 라이브러리 메시지는 outcome에 안 실린다 — ref만", async () => {
    const h = harness();
    const leak = new Error("connect ECONNREFUSED aws-0.pooler.supabase.com:6543 user=postgres.abc");
    leak.name = "PrismaClientInitializationError";
    hoisted.triggerPull.mockRejectedValue(leak);

    const outcome = await runSync(h.prisma, {
      projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u1",
    });
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("failed여야 한다");
    expect(outcome.error).not.toContain("pooler");
    expect(outcome.error).toMatch(/ref/);
    expect(h.syncRuns[0]).toMatchObject({ status: "FAILED", errorCode: "db-unavailable" });
  });

  it("finishedAt이 세 terminal 전부에 선다", async () => {
    for (const result of [
      COMMITTED,
      { status: "skipped" as const, reason: "no-changes" as const },
      null,
    ]) {
      const h = harness();
      if (result === null) hoisted.triggerPull.mockRejectedValue(new Error("x"));
      else hoisted.triggerPull.mockResolvedValue(result);
      await runSync(h.prisma, { projectId: "p1", slug: "acme", trigger: "cron", requestedBy: null });
      expect(h.syncRuns[0]?.finishedAt).toBeInstanceOf(Date);
    }
  });

  it("warnings 수가 행에 남는다 — 버린 값을 성공으로 숨기지 않는다", async () => {
    const h = harness();
    hoisted.triggerPull.mockResolvedValue({ ...COMMITTED, warnings: ["a: x", "b: y"] });
    await runSync(h.prisma, { projectId: "p1", slug: "acme", trigger: "cron", requestedBy: null });
    expect(h.syncRuns[0]).toMatchObject({ warnings: 2 });
  });
});

describe("runSync — 잠금과 순서", () => {
  it("Project 행을 FOR UPDATE로 잠그고, 그것이 행 생성보다 앞이다", async () => {
    const h = harness();
    await runSync(h.prisma, { projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u1" });

    expect(h.spies.executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = h.spies.executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("?")).toMatch(/"Project"[\s\S]*FOR UPDATE/);
    expect(values).toEqual(["p1"]);

    const lockOrder = h.spies.executeRaw.mock.invocationCallOrder[0] ?? Infinity;
    const createOrder = h.spies.createSyncRun.mock.invocationCallOrder[0] ?? -Infinity;
    expect(lockOrder).toBeLessThan(createOrder);
  });

  it("⚠️ 잠금 트랜잭션 안에서 GitHub을 부르지 않는다 — 지연이 곧 커넥션 점유다", async () => {
    const h = harness();
    let insideTransaction = false;
    const original = h.prisma.$transaction.bind(h.prisma);
    h.prisma.$transaction = (async (fn: (tx: unknown) => Promise<unknown>) => {
      insideTransaction = true;
      try {
        return await original(fn as never);
      } finally {
        insideTransaction = false;
      }
    }) as typeof h.prisma.$transaction;
    hoisted.triggerPull.mockImplementation(async () => {
      expect(insideTransaction).toBe(false);
      return COMMITTED;
    });

    await runSync(h.prisma, { projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u1" });
    expect(hoisted.triggerPull).toHaveBeenCalledTimes(1);
  });

  it("행 insert가 던지면 행도 없고 triggerPull도 안 불린다", async () => {
    const h = harness();
    h.spies.createSyncRun.mockRejectedValueOnce(new Error("insert failed"));
    await expect(
      runSync(h.prisma, { projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u1" }),
    ).rejects.toThrow("insert failed");
    expect(h.syncRuns).toHaveLength(0);
    expect(hoisted.triggerPull).not.toHaveBeenCalled();
  });
});

describe("runSync — 게이트 거부", () => {
  it("이미 돌고 있으면 already-running이고 행을 만들지 않는다", async () => {
    const h = harness();
    let release: (() => void) | undefined;
    hoisted.triggerPull.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve(COMMITTED); }),
    );

    const first = runSync(h.prisma, {
      projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u1",
    });
    // 첫 호출이 RUNNING 행을 만들 때까지 마이크로태스크를 흘려보낸다.
    await vi.advanceTimersByTimeAsync(0);
    expect(h.syncRuns).toHaveLength(1);

    const second = await runSync(h.prisma, {
      projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u2",
    });
    expect(second).toEqual({ status: "failed", error: "already-running" });
    expect(h.syncRuns).toHaveLength(1);

    release?.();
    await first;
    expect(hoisted.triggerPull).toHaveBeenCalledTimes(1);
  });

  it("다른 프로젝트의 RUNNING은 내 실행을 막지 않는다", async () => {
    const h = harness({
      projects: [{ id: "p1", slug: "acme" }, { id: "p2", slug: "other" }],
      syncRuns: [{ id: "r-other", projectId: "p2", status: "RUNNING", startedAt: ago(5) }],
    });
    const outcome = await runSync(h.prisma, {
      projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u1",
    });
    expect(outcome).toEqual(COMMITTED);
    expect(h.syncRuns.filter((r) => r.projectId === "p1")).toHaveLength(1);
  });

  it("직전 성공이 10초 전이면 too-soon이고 남은 초를 준다", async () => {
    const h = harness({
      syncRuns: [
        { id: "r1", projectId: "p1", status: "SUCCEEDED", startedAt: ago(20), finishedAt: ago(10) },
      ],
    });
    const outcome = await runSync(h.prisma, {
      projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u1",
    });
    expect(outcome).toEqual({ status: "failed", error: "too-soon", retryAfterSeconds: 20 });
    expect(hoisted.triggerPull).not.toHaveBeenCalled();
    expect(h.syncRuns).toHaveLength(1);
  });

  it("직전이 FAILED면 통과다 — 제한은 재시도 억제가 아니다", async () => {
    const h = harness({
      syncRuns: [
        { id: "r1", projectId: "p1", status: "FAILED", startedAt: ago(20), finishedAt: ago(10), errorCode: "github-error" },
      ],
    });
    const outcome = await runSync(h.prisma, {
      projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u1",
    });
    expect(outcome).toEqual(COMMITTED);
  });

  it("cron은 최소 간격에 안 걸린다", async () => {
    const h = harness({
      syncRuns: [
        { id: "r1", projectId: "p1", status: "SUCCEEDED", startedAt: ago(20), finishedAt: ago(1) },
      ],
    });
    const outcome = await runSync(h.prisma, {
      projectId: "p1", slug: "acme", trigger: "cron", requestedBy: null,
    });
    expect(outcome).toEqual(COMMITTED);
  });
});

describe("runSync — stale 복구", () => {
  it("STALE_AFTER보다 오래된 RUNNING은 FAILED/stale로 닫히고 새 실행이 시작된다", async () => {
    const h = harness({
      syncRuns: [
        { id: "r-stale", projectId: "p1", status: "RUNNING", startedAt: ago(STALE_AFTER_SECONDS + 1) },
      ],
    });
    const outcome = await runSync(h.prisma, {
      projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u1",
    });
    expect(outcome).toEqual(COMMITTED);

    const stale = h.syncRuns.find((r) => r.id === "r-stale");
    expect(stale).toMatchObject({ status: "FAILED", errorCode: "stale" });
    expect(stale?.finishedAt).toBeInstanceOf(Date);
    expect(h.syncRuns.filter((r) => r.status === "SUCCEEDED")).toHaveLength(1);
  });

  it("299초 전이면 아직 실행 중이다 — 진행 중인 실행을 뺏지 않는다", async () => {
    const h = harness({
      syncRuns: [
        { id: "r-live", projectId: "p1", status: "RUNNING", startedAt: ago(STALE_AFTER_SECONDS - 1) },
      ],
    });
    const outcome = await runSync(h.prisma, {
      projectId: "p1", slug: "acme", trigger: "manual", requestedBy: "u1",
    });
    expect(outcome).toEqual({ status: "failed", error: "already-running" });
    expect(h.syncRuns.find((r) => r.id === "r-live")?.status).toBe("RUNNING");
  });
});

describe("runSync — 실패가 마지막 성공을 안 덮는다 (완료 조건 2)", () => {
  it("껍데기가 Project 컬럼을 아예 안 쓴다", async () => {
    const h = harness();
    hoisted.triggerPull.mockRejectedValue(new Error("boom"));
    await runSync(h.prisma, { projectId: "p1", slug: "acme", trigger: "cron", requestedBy: null });

    // `triggerPull`을 mock하는 이상 이 단언이 보는 것은 "껍데기가 Project를 안 쓴다"까지다 —
    // 그 아래층(`runPull`이 실패 경로에서 `saveLastPulledAt`을 안 부른다)은 `run.test.ts`가 든다.
    for (const call of h.spies.updateProject.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(Object.keys(data)).not.toContain("lastPulledAt");
      expect(Object.keys(data)).not.toContain("lastPublishedAt");
      expect(Object.keys(data)).not.toContain("lastPrUrl");
    }
    const project = h.projects.find((p) => p.id === "p1");
    expect(project?.lastPublishedAt).toEqual(new Date("2026-09-01T00:00:00Z"));
    expect(project?.lastPrUrl).toBe("https://github.com/o/r/pull/7");
  });
});
