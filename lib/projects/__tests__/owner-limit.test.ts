import { describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));
const isOperatorUser = vi.hoisted(() => vi.fn(async (_db: unknown, _userId: string) => false));
vi.mock("@/lib/operator/user", () => ({ isOperatorUser }));

const { lockOwnerSlots } = await import("../owner-limit");

/**
 * 복원·OWNER 승격·OWNER 초대 수락의 상한 재집계 (operator-account C6~C8). 생성과 같은 단위 — `User` 잠금 · `ownedActiveProjects` ·
 * `PROJECT_LIMIT` · `isOperatorUser` — 를 쓴다. 결과는 "늘면 상한을 넘는 비운영자" 목록이고 비면 통과다.
 */
function fakeTx(owned: Record<string, number>) {
  const calls: string[] = [];
  const executeRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(`lock:${String(values[0])}`);
    expect(strings.join("?")).toMatch(/SELECT "id" FROM "User" WHERE "id" = \? FOR UPDATE/);
    return 1;
  });
  const count = vi.fn(async ({ where }: { where: { userId: string; role: string; project: { archivedAt: null } } }) => {
    calls.push(`count:${where.userId}`);
    // 셈 조건이 생성 경로(`ownedActiveProjects`)와 같다 — 갈리면 한쪽이 통과시킨 것을 다른 쪽이 거부한다.
    expect(where).toEqual({ userId: where.userId, role: "OWNER", project: { archivedAt: null } });
    return owned[where.userId] ?? 0;
  });
  const tx = { $executeRaw: executeRaw, projectMember: { count } } as unknown as Prisma.TransactionClient;
  return { tx, calls, count };
}

describe("lockOwnerSlots", () => {
  it("User를 id 순으로 잠그고 잠금이 셈보다 먼저다 — 교착을 피하는 순서", async () => {
    isOperatorUser.mockClear();
    const { tx, calls } = fakeTx({});
    await lockOwnerSlots(tx, ["u-c", "u-a", "u-b"]);
    expect(calls.slice(0, 3)).toEqual(["lock:u-a", "lock:u-b", "lock:u-c"]);
    expect(calls.slice(3).every((c) => c.startsWith("count:"))).toBe(true);
  });

  it("상한 미만은 운영자를 조회하지 않고 통과다", async () => {
    isOperatorUser.mockClear();
    const { tx } = fakeTx({ "u-a": 2, "u-b": 0 });
    expect(await lockOwnerSlots(tx, ["u-a", "u-b"])).toEqual([]);
    expect(isOperatorUser).not.toHaveBeenCalled();
  });

  it("상한인 비운영자만 돌려준다", async () => {
    isOperatorUser.mockReset().mockResolvedValue(false);
    const { tx } = fakeTx({ "u-a": 3, "u-b": 1, "u-c": 5 });
    expect(await lockOwnerSlots(tx, ["u-c", "u-b", "u-a"])).toEqual(["u-a", "u-c"]);
    expect(isOperatorUser.mock.calls.map((c) => c[1]).sort()).toEqual(["u-a", "u-c"]);
  });

  it("운영자는 빠진다 — 같은 tx로 조회한다", async () => {
    isOperatorUser.mockReset().mockImplementation(async (_db, userId) => userId === "u-op");
    const { tx } = fakeTx({ "u-op": 3, "u-a": 3 });
    expect(await lockOwnerSlots(tx, ["u-op", "u-a"])).toEqual(["u-a"]);
    expect(isOperatorUser.mock.calls.every((c) => c[0] === tx)).toBe(true);
  });

  it("운영자 조회가 던지면 같이 던진다 — 호출부 트랜잭션이 롤백된다", async () => {
    isOperatorUser.mockReset().mockRejectedValue(new Error("db down"));
    const { tx } = fakeTx({ "u-a": 3 });
    await expect(lockOwnerSlots(tx, ["u-a"])).rejects.toThrow("db down");
  });

  it("alsoLock은 같은 정렬 집합으로 잠그되 세지 않는다 — 사건의 행위자 FK가 그 행에 KEY SHARE를 건다", async () => {
    isOperatorUser.mockReset().mockResolvedValue(false);
    const { tx, calls } = fakeTx({ "u-target": 1, "u-actor": 9 });
    expect(await lockOwnerSlots(tx, ["u-target"], ["u-actor", "u-target"])).toEqual([]);
    expect(calls.filter((c) => c.startsWith("lock:"))).toEqual(["lock:u-actor", "lock:u-target"]);
    expect(calls.filter((c) => c.startsWith("count:"))).toEqual(["count:u-target"]);
    expect(isOperatorUser).not.toHaveBeenCalled();
  });

  it("같은 id가 둘이면 한 번만 잠근다", async () => {
    isOperatorUser.mockClear();
    const { tx, calls } = fakeTx({});
    await lockOwnerSlots(tx, ["u-a", "u-a"]);
    expect(calls.filter((c) => c.startsWith("lock:"))).toEqual(["lock:u-a"]);
  });
});
