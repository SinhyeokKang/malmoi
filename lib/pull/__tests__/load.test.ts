import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";

import { saveLastPulledAt } from "../load";

/**
 * **두 컬럼의 뜻이 다르다** (translation-ui design §3.4·§3.5):
 *
 * - `lastPulledAt` — 캡처된 `max(updatedAt)`. 1층 스킵의 비교 대상이고 **변경 없는 스킵에도 전진한다.**
 * - `lastPublishedAt`·`lastPrUrl` — "마지막으로 **보낸**" 것. 스킵은 건드리지 않는다.
 *
 * 섞이면 툴바의 "Last sent"가 아무것도 안 보낸 밤마다 갱신된다.
 */
function fakePrisma() {
  const update = vi.fn(async (_args: unknown) => ({}));
  return { prisma: { project: { update } } as unknown as PrismaClient, update };
}

describe("saveLastPulledAt", () => {
  const at = new Date("2026-09-08T10:00:00Z");

  it("스킵은 lastPulledAt만 쓴다 — 보낸 것이 없다", async () => {
    const { prisma, update } = fakePrisma();
    await saveLastPulledAt(prisma, "p1", at);
    expect(update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { lastPulledAt: at } });
  });

  it("커밋되면 세 컬럼을 같은 update에 싣는다 — 왕복을 두 번 만들지 않는다", async () => {
    const { prisma, update } = fakePrisma();
    await saveLastPulledAt(prisma, "p1", at, { prUrl: "https://github.com/o/r/pull/1" });

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0]?.[0] as unknown as {
      where: { id: string };
      data: { lastPulledAt: Date; lastPublishedAt: Date; lastPrUrl: string };
    };
    expect(arg.where).toEqual({ id: "p1" });
    expect(arg.data.lastPulledAt).toBe(at);
    expect(arg.data.lastPrUrl).toBe("https://github.com/o/r/pull/1");
    expect(arg.data.lastPublishedAt).toBeInstanceOf(Date);
  });

  it("보낸 시각은 캡처 값이 아니라 벽시계다 — 두 컬럼이 같은 값이면 뜻이 하나로 무너진다", async () => {
    const { prisma, update } = fakePrisma();
    await saveLastPulledAt(prisma, "p1", new Date("2020-01-01T00:00:00Z"), { prUrl: "u" });
    const data = (update.mock.calls[0]?.[0] as unknown as { data: { lastPublishedAt: Date } }).data;
    expect(data.lastPublishedAt.getFullYear()).toBeGreaterThan(2020);
  });
});

it("로케일·값·완료 기준을 repeatable-read 스냅샷으로 읽는다", async () => {
  const { loadPullState } = await import("../load");
  const tx = {
    project: { findUnique: vi.fn(async () => ({ id: "p1", slug: "a", locales: [] })) },
    stringKey: { findMany: vi.fn(async () => []) },
    translation: { aggregate: vi.fn(async () => ({ _max: { updatedAt: new Date(100) } })) },
  };
  const transaction = vi.fn(async (fn: (client: typeof tx) => Promise<unknown>, _options: unknown) => fn(tx));
  const state = await loadPullState({ $transaction: transaction } as unknown as PrismaClient, "a");
  expect(state.maxUpdatedAt).toEqual(new Date(100));
  expect(transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "RepeatableRead" }));
});
