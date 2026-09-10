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
it.each(["missing-session", "wrong-account", "multiple-accounts"])("start rejects %s without mutation", async failure => {
  const { db, tx } = fixture();
  if (failure === "missing-session") tx.session.findFirst.mockResolvedValue(null);
  else tx.account.findMany.mockResolvedValue(failure === "multiple-accounts" ? [{ provider: "github", providerAccountId: "gh", userId: "u" }, { provider: "google", providerAccountId: "g", userId: "u" }] : []);
  expect(await beginRevocation(db, { ...input, userId: "u" })).toBe("invalid");
  expect(tx.verificationToken.create).not.toHaveBeenCalled();
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
