import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { hashSessionToken } from "@/lib/credentials/crypto";
import { beginConnect, finishConnect } from "../store";
import { connectChallengeIdentifier } from "../plan";
vi.mock("@/lib/credentials/records", () => ({ decodeUser: (row: unknown) => row }));
vi.mock("@/lib/credentials/storage", () => ({ lookupEmail: (email: string) => `hmac:v1:test:${createHash("sha256").update(email).digest("hex")}` }));
const input = { userId: "u", nonce: Buffer.alloc(32, 12).toString("base64url"), provider: "google" as const, providerAccountId: "g", sessionToken: "raw", state: "state", verifiedEmail: "same@example.com" };
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const row = { identifier: connectChallengeIdentifier({ userId: "u", provider: "google", emailLookup: `hmac:v1:test:${createHash("sha256").update(input.verifiedEmail).digest("hex")}`, sessionDigest: hashSessionToken(input.sessionToken), stateDigest: createHash("sha256").update("malmoi/account-connect/state/v1\0state").digest("hex") }), token: createHash("sha256").update(`malmoi/account-connect/nonce/v1\0${input.nonce}`).digest("hex"), expires: new Date(Date.now() + 300000) };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "u" }]),
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "u", email: input.verifiedEmail }) },
    session: { findFirst: vi.fn().mockResolvedValue({ userId: "u" }) },
    account: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0), create: vi.fn() },
    verificationToken: { findFirst: vi.fn().mockResolvedValue(row), findUnique: vi.fn().mockResolvedValue(row), create: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const db = { ...tx, $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) } as unknown as PrismaClient;
  return { db, tx, row };
}
it("start checks a live owner session and only replaces that owner's connect challenges", async () => {
  const { db, tx } = fixture();
  expect(await beginConnect(db, input)).toBe("ready");
  expect(tx.session.findFirst).toHaveBeenCalledWith({ where: { userId: "u", sessionToken: hashSessionToken("raw"), expires: { gt: expect.any(Date) } } });
  expect(tx.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: { startsWith: '["malmoi/account-connect","v1","u",' } } });
  expect(tx.account.create).not.toHaveBeenCalled();
});
it.each(["no-lock", "gone-under-lock", "consume-lost", "expired"])("%s cannot write an Account", async mode => {
  const { db, tx, row } = fixture();
  if (mode === "no-lock") tx.$queryRaw.mockResolvedValue([]);
  if (mode === "gone-under-lock") tx.verificationToken.findUnique.mockResolvedValue(null);
  if (mode === "consume-lost") tx.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  if (mode === "expired") row.expires = new Date(0);
  expect(await finishConnect(db, input)).toBe("expired");
  expect(tx.account.create).not.toHaveBeenCalled();
});
it("same-provider membership blocks a different identity after the pure decision", async () => {
  const { db, tx } = fixture();
  tx.account.count.mockResolvedValue(1);
  expect(await finishConnect(db, input)).toBe("already-connected");
  expect(tx.verificationToken.deleteMany).not.toHaveBeenCalled();
  expect(tx.account.create).not.toHaveBeenCalled();
});
it("consumption after lock recheck precedes a four-field Account insert", async () => {
  const { db, tx, row } = fixture();
  expect(await finishConnect(db, input)).toBe("connected");
  expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.verificationToken.findUnique.mock.invocationCallOrder[0]!);
  expect(tx.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: row.identifier, token: row.token, expires: { equals: row.expires, gt: expect.any(Date) } } });
  expect(tx.verificationToken.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.account.create.mock.invocationCallOrder[0]!);
  expect(tx.account.create).toHaveBeenCalledWith({ data: { userId: "u", type: "oauth", provider: "google", providerAccountId: "g" } });
});
it.each(["begin", "finish"])("%s logs only a fixed operation and stage for unexpected errors", async operation => {
  const { db, tx } = fixture();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  tx.user.findUniqueOrThrow.mockRejectedValue(new Error("private email and SQL"));
  expect(await (operation === "begin" ? beginConnect(db, input) : finishConnect(db, input))).toBe("failed");
  expect(log).toHaveBeenCalledWith(`Account connect ${operation} failed.`, { stage: "email" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private");
});
