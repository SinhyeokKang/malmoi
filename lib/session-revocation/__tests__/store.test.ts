import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { beginRevocation, finishRevocation } from "../store";
import { challengeIdentifier, nonceHash, stateHash } from "../policy";
import { hashSessionToken } from "@/lib/credentials/crypto";
const nonce = Buffer.alloc(32, 12).toString("base64url");
const input = { nonce, sessionToken: "raw", state: "state", provider: "github" as const, providerAccountId: "gh" };
function fixture() {
  const context = { userId: "u", provider: "github" as const, providerAccountId: "gh", sessionDigest: hashSessionToken("raw"), stateDigest: stateHash("state") };
  const row = { identifier: challengeIdentifier(context), token: nonceHash(nonce), expires: new Date(Date.now() + 300000) };
  const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: "u" }]), account: { findMany: vi.fn().mockResolvedValue([{ provider: "github", providerAccountId: "gh", userId: "u" }]), findFirst: vi.fn().mockResolvedValue({ userId: "u" }) }, session: { findFirst: vi.fn().mockResolvedValue({ userId: "u" }), deleteMany: vi.fn().mockResolvedValue({ count: 2 }) }, verificationToken: { findFirst: vi.fn().mockResolvedValue(row), create: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } };
  const db = { ...tx, $transaction: vi.fn(async fn => fn(tx)) } as unknown as PrismaClient;
  return { db, tx, row };
}
it("start rechecks current session and one login account, replaces only own challenges", async () => {
  const { db, tx } = fixture();
  expect(await beginRevocation(db, { ...input, userId: "u" })).toBe("ready");
  expect(tx.verificationToken.create).toHaveBeenCalledWith({ data: expect.objectContaining({ token: nonceHash(nonce), identifier: expect.not.stringContaining('"raw"') }) });
  expect(tx.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: { startsWith: '["malmoi/session-revocation","v1","u",' } } });
  expect(tx.session.deleteMany).not.toHaveBeenCalled();
});
/**
 * ⚠️ **`multiple-accounts`가 갈래에서 빠졌다** (account-linking T6) — 수단이 둘이 되는 순간 전체
 * 세션 회수가 **항상 `invalid`로 멈추던** 조건이고, 그 거부를 정답으로 단언하던 것이 이 줄이다.
 * 대신하는 것은 `pickLoginAccount`의 **결정성**이다: 서버가 고른 상대와 다른 provider로 시작하려
 * 하면 여전히 거부한다(클라이언트가 확인 상대를 고르게 하면 공격자가 고른다).
 */
it.each(["missing-session", "no-account", "not-the-picked-account"])("start rejects %s without mutation", async failure => {
  const { db, tx } = fixture();
  if (failure === "missing-session") tx.session.findFirst.mockResolvedValue(null);
  else if (failure === "no-account") tx.account.findMany.mockResolvedValue([]);
  else tx.account.findMany.mockResolvedValue([{ provider: "github", providerAccountId: "gh", userId: "u" }, { provider: "google", providerAccountId: "g", userId: "u" }]);
  const proof = failure === "not-the-picked-account" ? { ...input, provider: "google" as const, providerAccountId: "g" } : input;
  expect(await beginRevocation(db, { ...proof, userId: "u" })).toBe("invalid");
  expect(tx.verificationToken.create).not.toHaveBeenCalled();
});

/** 수단이 둘이어도 회수가 시작된다 — `github` 우선으로 고정된 상대를 서버가 고른다. */
it("start succeeds with two sign-in methods and confirms against github", async () => {
  const { db, tx } = fixture();
  tx.account.findMany.mockResolvedValue([{ provider: "google", providerAccountId: "g", userId: "u" }, { provider: "github", providerAccountId: "gh", userId: "u" }]);
  expect(await beginRevocation(db, { ...input, userId: "u" })).toBe("ready");
  expect(tx.verificationToken.create).toHaveBeenCalledWith({ data: expect.objectContaining({ identifier: expect.stringContaining('"github"') }) });
});
it("finish consumes request before deleting only that user's sessions", async () => {
  const { db, tx } = fixture();
  expect(await finishRevocation(db, input)).toBe("revoked");
  expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u" } });
  expect(tx.verificationToken.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.session.deleteMany.mock.invocationCallOrder[0]!);
});
it.each(["wrong-account", "wrong-state", "expired", "consumed", "session-gone", "account-gone"])("finish rejects %s without deleting sessions", async failure => {
  const { db, tx, row } = fixture();
  const attempt = { ...input };
  if (failure === "wrong-account") attempt.providerAccountId = "other";
  if (failure === "wrong-state") attempt.state = "other";
  if (failure === "expired") row.expires = new Date(0);
  if (failure === "consumed") tx.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  if (failure === "session-gone") tx.session.findFirst.mockResolvedValue(null);
  if (failure === "account-gone") tx.account.findFirst.mockResolvedValue(null);
  expect(await finishRevocation(db, attempt)).not.toBe("revoked");
  expect(tx.session.deleteMany).not.toHaveBeenCalled();
});
it("database failures return fixed unavailable, never exception details", async () => {
  const { db, tx } = fixture();
  tx.session.deleteMany.mockRejectedValue(new Error("secret query"));
  expect(await finishRevocation(db, input)).toBe("unavailable");
});
