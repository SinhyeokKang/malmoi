import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
vi.mock("server-only", () => ({}));
import { credentialAdapter } from "../adapter";
import { hashSessionToken } from "../crypto";
import { encodeUserFields } from "../records";
beforeEach(() => {
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "k1");
  vi.stubEnv("EMAIL_LOOKUP_KEY", Buffer.alloc(32, 2).toString("base64"));
  vi.stubEnv("EMAIL_LOOKUP_KEY_ID", "k1");
});
afterEach(() => vi.unstubAllEnvs());
it("세션 생성은 DB에 해시, Auth.js에는 원문을 반환한다", async () => {
  const create = vi.fn(async ({ data }) => data);
  const adapter = credentialAdapter({ session: { create } } as unknown as PrismaClient);
  const input = { sessionToken: "secret", userId: "u1", expires: new Date(Date.now() + 10000) };
  expect(await adapter.createSession!(input)).toEqual(input);
  expect(create.mock.calls[0]![0].data.sessionToken).toBe(hashSessionToken("secret"));
});
it("OAuth 조회도 만료를 거부하고 유효 user만 복호화한다", async () => {
  const user = { id: "u1", emailVerified: null, ...encodeUserFields("u1", { email: "a@x.com" }) };
  const findUnique = vi.fn().mockResolvedValue({ sessionToken: hashSessionToken("secret"), userId: "u1", expires: new Date(100), user });
  const adapter = credentialAdapter({ session: { findUnique, deleteMany: vi.fn() } } as unknown as PrismaClient, () => new Date(100));
  expect(await adapter.getSessionAndUser!("secret")).toBeNull();
  findUnique.mockResolvedValue({ sessionToken: hashSessionToken("secret"), userId: "u1", expires: new Date(101), user });
  expect(await adapter.getSessionAndUser!("secret")).toMatchObject({ session: { sessionToken: "secret" }, user: { email: "a@x.com" } });
  await adapter.getSessionAndUser!(hashSessionToken("secret"));
  expect(findUnique).toHaveBeenLastCalledWith({ where: { sessionToken: hashSessionToken(hashSessionToken("secret")) }, include: { user: true } });
});
it("삭제된 세션을 갱신으로 생성하지 않는다", async () => {
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const adapter = credentialAdapter({ session: { updateMany } } as unknown as PrismaClient, () => new Date(100));
  expect(await adapter.updateSession!({ sessionToken: "secret", expires: new Date(1000) })).toBeNull();
  expect(updateMany.mock.calls[0]![0].where.expires).toEqual({ gt: new Date(100) });
});
it("DB 장애를 세션 없음으로 삼키지 않는다", async () => {
  const adapter = credentialAdapter({ session: { findUnique: vi.fn().mockRejectedValue(new Error("db down")) } } as unknown as PrismaClient);
  await expect(adapter.getSessionAndUser!("secret")).rejects.toThrow();
});
it("암호화 어댑터도 기존 사용자에 추가 로그인 계정을 연결하지 않는다", async () => {
  const create = vi.fn();
  const tx = { $executeRaw: vi.fn(), account: { findFirst: vi.fn().mockResolvedValue({ provider: "google" }), create } };
  const adapter = credentialAdapter({ account: { create }, $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient);
  await expect(adapter.linkAccount!({ userId: "u1", provider: "github", providerAccountId: "attacker", type: "oauth" })).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
});
it("만료 세션 정리는 digest와 현재 만료 조건을 함께 사용한다", async () => {
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const adapter = credentialAdapter({ session: { findUnique: vi.fn().mockResolvedValue({ expires: new Date(99) }), deleteMany } } as unknown as PrismaClient, () => new Date(100));
  expect(await adapter.getSessionAndUser!("raw")).toBeNull();
  expect(deleteMany).toHaveBeenCalledWith({ where: { sessionToken: hashSessionToken("raw"), expires: { lte: new Date(100) } } });
});
