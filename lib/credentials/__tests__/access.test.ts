import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
vi.mock("server-only", () => ({}));
import { findUserByEmail, refreshVerifiedEmail } from "../access";
import { encodeUserFields } from "../records";
import { lookupEmail } from "../storage";
beforeEach(() => {
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "k1");
  vi.stubEnv("EMAIL_LOOKUP_KEY", Buffer.alloc(32, 2).toString("base64"));
  vi.stubEnv("EMAIL_LOOKUP_KEY_ID", "k1");
});
afterEach(() => vi.unstubAllEnvs());
it("이메일 HMAC 조회 후 실제 복호화 주소까지 대조한다", async () => {
  const findUnique = vi.fn().mockResolvedValue({ id: "u1", ...encodeUserFields("u1", { email: "a@x.com" }) });
  const db = { user: { findUnique } } as unknown as PrismaClient;
  expect(await findUserByEmail(db, " A@X.COM ")).toMatchObject({ id: "u1", email: "a@x.com" });
  expect(findUnique.mock.calls[0]![0].where).toEqual({ emailLookup: lookupEmail("a@x.com") });
  await expect(findUserByEmail(db, "other@x.com")).rejects.toThrow("credential storage unavailable");
});
it("기존 로그인 이메일의 동시 unique 충돌은 로그인 거부로 바꾸지 않는다", async () => {
  const row = { id: "u1", ...encodeUserFields("u1", { email: "old@x.com" }) };
  const tx = { $executeRaw: vi.fn(), account: { findUnique: vi.fn().mockResolvedValue({ userId: "u1" }), count: vi.fn().mockResolvedValue(1) }, user: {
    findUnique: vi.fn().mockResolvedValueOnce(row).mockResolvedValueOnce(null),
    update: vi.fn().mockRejectedValue({ code: "P2002", message: "PRIVATE" }),
  } };
  const db = { account: tx.account, $transaction: async (fn: (v: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient;
  await expect(refreshVerifiedEmail(db, "github", "gh1", "new@x.com")).resolves.toBe("conflict");
});
