import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";

import { loadHomeRuns } from "../runs";

/**
 * Home Sync·Publish 탭 조회의 모양 (project-card-tabs §2.2). 사건 둘을 한 라운드에서 읽고, **행위자를 싣지 않고**(POSTMORTEM 2026-09-29 #146),
 * 전부 `projectId`로 좁힌다(불변식 — 테넌트 경계). SQL 술어가 `advancedSyncTime`과 같은 행을 고르는지는 `runs.integration.ts`가 잰다.
 */
function fakePrisma(rows: unknown[]) {
  const findFirst = vi.fn(async () => rows.shift() ?? null);
  return { prisma: { projectEvent: { findFirst } } as unknown as PrismaClient, findFirst };
}

type Call = { where: Record<string, unknown> & { projectId: string }; select: Record<string, unknown> };
const calls = (findFirst: ReturnType<typeof fakePrisma>["findFirst"]) => (findFirst.mock.calls as unknown as [Call][]).map(([args]) => args);

describe("loadHomeRuns", () => {
  it("조회 둘이 전부 projectId로 좁히고 행위자를 고르지 않는다", async () => {
    const { prisma, findFirst } = fakePrisma([]);
    await loadHomeRuns(prisma, "p1");
    expect(findFirst).toHaveBeenCalledTimes(2);
    for (const args of calls(findFirst)) {
      expect(args.where.projectId).toBe("p1");
      expect(Object.keys(args.select)).not.toContain("actor");
      expect(Object.keys(args.select)).not.toContain("actorUserId");
    }
    expect(Object.keys(calls(findFirst)[0]!.select).sort()).toEqual(["actorKind", "finishedAt", "kind", "occurredAt", "payload", "result", "subtype"]);
    expect(calls(findFirst)[1]!.select).toMatchObject({ syncRun: { select: { finishedAt: true, prUrl: true, changedValues: true } } });
  });

  /** ⚠️ 최신 N건을 읽어 JS로 거르지 않는다 — 시각을 전진시킨 사건을 SQL 한 번에 고른다. */
  it("시각을 전진시킨 적재 · 성공 Publish 순으로 좁힌다", async () => {
    const { prisma, findFirst } = fakePrisma([]);
    await loadHomeRuns(prisma, "p1");
    const [sync, publish] = calls(findFirst).map((args) => args.where);
    expect(sync).toMatchObject({ kind: "IMPORT", OR: [
      { result: "imported" },
      { result: "partial", payload: { path: ["surfaces"], array_contains: [{ status: "imported" }] } },
    ] });
    expect(publish).toMatchObject({ kind: "PUBLISH", OR: [{ result: "sent" }, { syncRun: { status: "SUCCEEDED" } }] });
  });

  it("두 사건을 탭의 실행으로 옮긴다", async () => {
    const started = new Date("2026-10-03T18:00:00Z");
    const finished = new Date("2026-10-03T18:05:00Z");
    const nightly = { actorKind: "AUTOMATION", kind: "IMPORT", subtype: "import.nightly", result: "imported", occurredAt: started, finishedAt: finished,
      payload: { kind: "IMPORT", source: "nightly", surfaceSlugs: ["web"], keys: 10, changedValues: 2 } };
    const publish = { actorKind: "USER", kind: "PUBLISH", subtype: "publish.run", result: null, occurredAt: started, finishedAt: null,
      payload: { kind: "PUBLISH", surfaceSlugs: ["web"] }, syncRun: { finishedAt: finished, prUrl: "https://github.com/o/r/pull/1", changedValues: 3 } };
    const { prisma } = fakePrisma([nightly, publish]);
    expect(await loadHomeRuns(prisma, "p1")).toEqual({
      sync: { trigger: "nightly", at: finished, result: "imported", changedValues: 2, keys: 10, surfaceSlugs: ["web"] },
      publish: { trigger: "manual", at: finished, prUrl: "https://github.com/o/r/pull/1", changedValues: 3, surfaceSlugs: ["web"] },
    });
  });

  it("사건이 없으면 둘 다 null", async () => {
    const { prisma } = fakePrisma([]);
    expect(await loadHomeRuns(prisma, "p1")).toEqual({ sync: null, publish: null });
  });
});
