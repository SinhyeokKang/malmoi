import { beforeEach, expect, it, vi } from "vitest";

import { createHarness } from "@/app/(edit)/__tests__/harness";

const state = vi.hoisted(() => ({ triggerPull: vi.fn() }));
vi.mock("@/lib/pull/trigger", () => ({ triggerPull: state.triggerPull }));
const { runSync } = await import("../run");

beforeEach(() => state.triggerPull.mockReset().mockResolvedValue({ status: "skipped", reason: "no-edits" }));

it("cron rechecks archive after its Project lock, before creating a run", async () => {
  const h = createHarness({ projects: [{ id: "p1", slug: "acme" }] });
  // Target selection saw an active project; archive commits before the start lock returns.
  // 하네스의 executeRaw는 일반 Promise mock이다 — Prisma의 브랜드 반환형을 위조하지 않는다.
  const executor: { $executeRaw: (...args: Parameters<typeof h.prisma.$executeRaw>) => Promise<number> } = h.prisma;
  vi.spyOn(executor, "$executeRaw").mockImplementationOnce(async () => {
    h.projects[0]!.archivedAt = new Date();
    return 1;
  });
  expect(await runSync(h.prisma, { projectId: "p1", slug: "acme", trigger: "cron", requestedBy: null, credential: undefined }))
    .toEqual({ status: "failed", error: "archived", delivery: "not-started", retryable: false });
  expect(h.syncRuns).toEqual([]);
  expect(state.triggerPull).not.toHaveBeenCalled();
});

it("an active project still starts its nightly Publish", async () => {
  const h = createHarness({ projects: [{ id: "p1", slug: "acme" }] });
  expect(await runSync(h.prisma, { projectId: "p1", slug: "acme", trigger: "cron", requestedBy: null, credential: undefined }))
    .toEqual({ status: "skipped", reason: "no-edits" });
  expect(h.syncRuns).toHaveLength(1);
  expect(state.triggerPull).toHaveBeenCalledOnce();
});

it("늦은 실행 종료는 이미 stale로 닫힌 실행을 성공으로 덮지 않는다", async () => {
  const h = createHarness({ projects: [{ id: "p1", slug: "acme" }] });
  state.triggerPull.mockImplementationOnce(async () => {
    Object.assign(h.syncRuns[0]!, { status: "FAILED", errorCode: "stale" });
    return { status: "skipped", reason: "no-edits" };
  });
  expect(await runSync(h.prisma, { projectId: "p1", slug: "acme", trigger: "cron", requestedBy: null, credential: undefined })).toMatchObject({ status: "failed", delivery: "unknown" });
  expect(h.syncRuns[0]).toMatchObject({ status: "FAILED", errorCode: "stale" });
});

it("결과 미확인 실패는 새 성공 행보다 앞에 있어도 재실행을 막는다", async () => {
  const h = createHarness({ projects: [{ id: "p1", slug: "acme" }] });
  await h.prisma.syncRun.create({ data: { id: "uncertain", projectId: "p1", status: "FAILED", trigger: "MANUAL", errorCode: "execution-uncertain", startedAt: new Date() } });
  const result = await runSync(h.prisma, { projectId: "p1", slug: "acme", trigger: "cron", requestedBy: null, credential: undefined });
  expect(result).toMatchObject({ status: "failed", error: "publish-unsettled", delivery: "not-started" });
  expect(state.triggerPull).not.toHaveBeenCalled();
  expect(h.syncRuns).toHaveLength(1);
});

it("리포 mutation 뒤 실패는 unknown으로 남고 다음 실행·화면·야간 집계는 같은 거부를 읽는다", async () => {
  const { planPublishView } = await import("@/lib/publish/plan");
  const { pullRevalidates } = await import("@/lib/pull/message");
  const { summarizeNightly } = await import("@/lib/nightly/summary");
  const h = createHarness({ projects: [{ id: "p1", slug: "acme" }] });
  state.triggerPull.mockImplementationOnce(async (_db, _slug, _id, _fingerprint, execution) => {
    await execution.fetch(async () => new Response("{}"))("https://api.github.com/repos/o/r/git/refs", { method: "POST" });
    throw new Error("fixture");
  });
  const input = { projectId: "p1", slug: "acme", trigger: "cron" as const, requestedBy: null, credential: undefined };
  expect(await runSync(h.prisma, input)).toMatchObject({ status: "failed", code: "execution-uncertain", delivery: "unknown" });
  expect(h.syncRuns[0]).toMatchObject({ status: "FAILED", errorCode: "execution-uncertain" });
  const blocked = await runSync(h.prisma, input);
  expect(planPublishView(blocked)).toBe("publish-unsettled");
  expect(pullRevalidates(blocked)).toBe(true);
  expect(summarizeNightly([{ slug: "acme", action: "publish", ...blocked }], 0).counts).toMatchObject({ failed: 0, "refused.publish-unsettled": 1 });
});
