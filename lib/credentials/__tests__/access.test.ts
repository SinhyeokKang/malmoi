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

/**
 * ⚠️ **OAuth 재로그인이 이름을 덮지 않는다는 것이 계약이다** (account-settings 태스크 2).
 *
 * 재로그인이 실제로 지나는 쓰기는 이 함수의 `update` 하나이고, 그 payload에 `name`·`image`가
 * 없다는 것이 사용자가 고친 표시 이름을 지키는 유일한 근거다. provider profile을 통째로 넘기는
 * 변경이 들어오면 여기가 red다 — 그 전까지는 조용히 이름이 사라지는 부류다.
 */
it("재로그인의 이메일 갱신은 이름·사진을 함께 쓰지 않는다", async () => {
  const row = { id: "u1", ...encodeUserFields("u1", { email: "old@x.com" }) };
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }));
  const tx = {
    $executeRaw: vi.fn(),
    account: { findUnique: vi.fn().mockResolvedValue({ userId: "u1" }), count: vi.fn().mockResolvedValue(1) },
    // 두 번째 조회는 "그 주소를 쓰는 다른 User가 없다"이다 — 있으면 `conflict`로 갈라진다.
    user: { findUnique: vi.fn().mockResolvedValueOnce(row).mockResolvedValueOnce(null), update },
  };
  const db = { account: tx.account, $transaction: async (fn: (v: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient;
  expect(await refreshVerifiedEmail(db, "github", "gh1", "new@x.com")).toBe("update");
  expect(Object.keys(update.mock.calls[0]![0].data).sort()).toEqual(["email", "emailLookup"]);
});
