import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { safePrismaAdapter } from "../safe-adapter";
it("OAuth 콜백이 사용하는 어댑터 조회부터 만료 세션을 거부한다", async () => {
  const findUnique = vi.fn().mockResolvedValue({ expires: new Date(100), user: { id: "victim" } });
  const adapter = safePrismaAdapter({ session: { findUnique, deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } } as unknown as PrismaClient, () => new Date(100));
  expect(await adapter.getSessionAndUser!("stolen")).toBeNull();
});
it("기존 사용자의 두 번째 로그인 수단을 쓰기 시점에 거부한다", async () => {
  const create = vi.fn();
  const tx = { $executeRaw: vi.fn(), account: { findFirst: vi.fn().mockResolvedValue({ provider: "google" }), create } };
  const adapter = safePrismaAdapter({ $transaction: async (fn: (x: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient);
  await expect(adapter.linkAccount!({ userId: "victim", type: "oauth", provider: "github", providerAccountId: "attacker" })).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
});
it("첫 로그인은 식별 필드만 저장한다", async () => {
  const create = vi.fn(async ({ data }) => data);
  const tx = { $executeRaw: vi.fn(), account: { findFirst: vi.fn().mockResolvedValue(null), create } };
  const adapter = safePrismaAdapter({ $transaction: async (fn: (x: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient);
  await adapter.linkAccount!({ userId: "u1", type: "oauth", provider: "github", providerAccountId: "1", access_token: "secret", refresh_token: "secret", id_token: "secret" });
  expect(create).toHaveBeenCalledWith({ data: { userId: "u1", type: "oauth", provider: "github", providerAccountId: "1" } });
});
it("DB 장애를 비로그인으로 바꾸지 않는다", async () => {
  const adapter = safePrismaAdapter({ session: { findUnique: vi.fn().mockRejectedValue(new Error("offline")) } } as unknown as PrismaClient);
  await expect(adapter.getSessionAndUser!("raw")).rejects.toThrow("offline");
});
it("만료행 정리는 현재도 만료인 행에만 적용한다", async () => {
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const findUnique = vi.fn().mockResolvedValue({ expires: new Date(99), user: { id: "u1" } });
  const adapter = safePrismaAdapter({ session: { findUnique, deleteMany } } as unknown as PrismaClient, () => new Date(100));
  expect(await adapter.getSessionAndUser!("raw")).toBeNull();
  expect(deleteMany).toHaveBeenCalledWith({ where: { sessionToken: "raw", expires: { lte: new Date(100) } } });
});
it("동시 첫 로그인 연결도 같은 사용자에 계정 하나만 남긴다", async () => {
  const rows: { provider: string }[] = [];
  let tail = Promise.resolve();
  const adapter = safePrismaAdapter({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      const tx = {
        $executeRaw: async () => {
          const previous = tail;
          tail = new Promise<void>(resolve => { release = resolve; });
          await previous;
        },
        account: {
          findFirst: async () => rows[0] ?? null,
          create: async ({ data }: { data: { provider: string } }) => { rows.push(data); return data; },
        },
      };
      try { return await fn(tx); } finally { release?.(); }
    },
  } as unknown as PrismaClient);
  const results = await Promise.allSettled(["github", "google"].map(provider =>
    adapter.linkAccount!({ userId: "same-user", type: "oauth", provider, providerAccountId: provider })
  ));
  expect(results.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  expect(rows).toHaveLength(1);
});
