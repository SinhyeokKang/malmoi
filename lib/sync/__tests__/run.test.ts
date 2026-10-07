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
