import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { safePrismaAdapter } from "../safe-adapter";
// 만료 세션 조회(만료 거부 · 장애 전파 · 조건부 정리)는 프로덕션 구현인 `credentialAdapter`에서 잰다 —
// `lib/credentials/__tests__/adapter.test.ts` (launch-readiness L4.7).
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
// GitLab 로그인 토큰도 콜백 밖에 남지 않는다 (gitlab-oauth spec §4-3 · design J4) — 게이트는 공급자 중립이라 코드 변경 없이 성립한다.
it("GitLab 첫 로그인도 식별 필드만 저장하고, 로그인 공급자가 아닌 provider는 거부한다", async () => {
  const create = vi.fn(async ({ data }) => data);
  const tx = { $executeRaw: vi.fn(), account: { findFirst: vi.fn().mockResolvedValue(null), create } };
  const adapter = safePrismaAdapter({ $transaction: async (fn: (x: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient);
  await adapter.linkAccount!({ userId: "u1", type: "oauth", provider: "gitlab", providerAccountId: "42", access_token: "secret", refresh_token: "secret", expires_at: 1 });
  expect(create).toHaveBeenCalledWith({ data: { userId: "u1", type: "oauth", provider: "gitlab", providerAccountId: "42" } });
  await expect(adapter.linkAccount!({ userId: "u1", type: "oauth", provider: "github-app", providerAccountId: "1" })).rejects.toThrow("unsupported login provider");
  expect(create).toHaveBeenCalledTimes(1);
});
it("GitLab도 기존 사용자의 두 번째 로그인 수단으로는 쓰기 시점에 거부한다", async () => {
  const create = vi.fn();
  const tx = { $executeRaw: vi.fn(), account: { findFirst: vi.fn().mockResolvedValue({ provider: "github" }), create } };
  const adapter = safePrismaAdapter({ $transaction: async (fn: (x: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient);
  await expect(adapter.linkAccount!({ userId: "victim", type: "oauth", provider: "gitlab", providerAccountId: "attacker" })).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
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
