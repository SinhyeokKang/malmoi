import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";

import { loadHomeRuns } from "../runs";

/**
 * Home 주체 조회의 모양 (nightly-sync F2). 사건 셋을 한 라운드에서 읽고, **행위자를 싣지 않고**(POSTMORTEM 2026-09-29 #146),
 * 전부 `projectId`로 좁힌다(불변식 — 테넌트 경계).
 */
function fakePrisma(rows: unknown[]) {
  const findFirst = vi.fn(async () => rows.shift() ?? null);
  return { prisma: { projectEvent: { findFirst } } as unknown as PrismaClient, findFirst };
}

describe("loadHomeRuns", () => {
  it("조회 셋이 전부 projectId로 좁히고 행위자·payload 밖의 원문을 고르지 않는다", async () => {
    const { prisma, findFirst } = fakePrisma([]);
    await loadHomeRuns(prisma, "p1");
    expect(findFirst).toHaveBeenCalledTimes(3);
    for (const [args] of findFirst.mock.calls as unknown as [{ where: { projectId: string }; select: Record<string, unknown> }][]) {
      expect(args.where.projectId).toBe("p1");
      expect(Object.keys(args.select).sort()).toEqual(["actorKind", "kind", "payload", "result", "subtype"]);
    }
  });

  it("성공 적재 · 최근 적재 · 성공 Publish 순으로 좁힌다", async () => {
    const { prisma, findFirst } = fakePrisma([]);
    await loadHomeRuns(prisma, "p1");
    const wheres = (findFirst.mock.calls as unknown as [{ where: Record<string, unknown> }][]).map(([args]) => args.where);
    expect(wheres[0]).toMatchObject({ kind: "IMPORT", result: { in: ["imported", "partial"] } });
    // ⚠️ 보류 한 줄은 **최신 적재 종류 사건 그대로**다 — 결과로 거르면 PR이 닫힌 뒤의 실패·upToDate를 건너뛰고 옛 open-pr 보류를 읽는다
    // (Codex 교차 리뷰 🟡). 주체는 첫 조회(성공만)가 정하므로 여기서 거를 이유가 없다.
    expect(wheres[1]).toEqual({ projectId: "p1", kind: "IMPORT" });
    expect(wheres[2]).toMatchObject({ kind: "PUBLISH", OR: [{ result: "sent" }, { syncRun: { status: "SUCCEEDED" } }] });
  });

  it("세 사건을 주체로 옮긴다", async () => {
    const nightly = { actorKind: "AUTOMATION", kind: "IMPORT", subtype: "import.nightly", result: "imported", payload: {} };
    const publish = { actorKind: "USER", kind: "PUBLISH", subtype: "publish.run", result: null, payload: {} };
    const { prisma } = fakePrisma([nightly, nightly, publish]);
    expect(await loadHomeRuns(prisma, "p1")).toEqual({ sync: "nightly", publish: "manual", heldByOpenPr: false });
  });
});
