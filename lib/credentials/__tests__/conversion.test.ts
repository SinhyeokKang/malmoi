import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { convertCredentials } from "../conversion";
import { credentialCommand } from "../command";
import { CredentialError } from "../crypto";
it("defaults to read-only and rejects apply without both cutover attestations", async () => {
  const updateMany = vi.fn();
  const db = { user: { findMany: vi.fn().mockResolvedValue([{ id: "u1", email: "a@x.com", name: null, image: null, emailLookup: null }]), updateMany }, account: { findMany: vi.fn().mockResolvedValue([]) }, projectInvitation: { findMany: vi.fn().mockResolvedValue([]) }, session: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
  expect(await convertCredentials(db, { mode: "backfill" })).toMatchObject({ users: 1, changes: 1, applied: 0 });
  expect(updateMany).not.toHaveBeenCalled();
  await expect(convertCredentials(db, { mode: "backfill", apply: true })).rejects.toThrow();
  expect(updateMany).not.toHaveBeenCalled();
});
it("rejects duplicate App accounts before any conversion", async () => {
  const a = { userId: "u1", provider: "github-app", providerAccountId: "1", access_token: null, refresh_token: null, id_token: null };
  const db = { user: { findMany: vi.fn().mockResolvedValue([]) }, account: { findMany: vi.fn().mockResolvedValue([a, { ...a, providerAccountId: "2" }]) }, projectInvitation: { findMany: vi.fn().mockResolvedValue([]) }, session: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
  await expect(convertCredentials(db, { mode: "backfill" })).rejects.toThrow();
});
it("commands reject unknown flags, implicit writes and URL arguments", () => {
  expect(credentialCommand([])).toEqual({ mode: "backfill", apply: false, trafficBlocked: false, writersDrained: false });
  // ⚠️ 맨 `toThrow()`로 재지 않는다 (audit #90) — 오타 하나로 난 TypeError도 통과한다. 거부는 CredentialError이고
  // 메시지가 인자를 싣지 않는다(URL의 비밀이 스크립트 출력에 안 남는다).
  const rejects = (args: string[]) => {
    expect(() => credentialCommand(args)).toThrow(CredentialError);
    try { credentialCommand(args); } catch (error) { expect(String(error)).not.toContain("secret"); }
  };
  rejects(["--url=postgres://secret"]);
  rejects(["--apply"]);
  rejects(["--apply", "--traffic-blocked"]);
  rejects(["--apply", "--traffic-blocked", "--writers-drained", "--mode=verify"]);
  rejects(["--mode=secret"]);
  rejects(["--mode=reindex", "--mode=backfill"]);
  expect(credentialCommand(["--apply", "--traffic-blocked", "--writers-drained", "--mode=reindex"])).toMatchObject({ mode: "reindex", apply: true });
});
it("dev target cannot be overridden by pg query parameters", async () => {
  const { credentialTarget } = await import("../command");
  const url = "postgresql://postgres.bfugwmjubgmmroevrave:fixture@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";
  expect(credentialTarget({ CREDENTIAL_TARGET: "dev", DIRECT_URL: url }).target).toBe("dev");
  for (const query of ["user=postgres.xgsyyapzkpbdtkrprlmn", "port=6543", "password=override", "host=elsewhere", "options=unsafe", "sslmode=disable"]) {
    expect(() => credentialTarget({ CREDENTIAL_TARGET: "dev", DIRECT_URL: `${url}?${query}` })).toThrow();
  }
});
it("verification reports old-key ciphertext counts before key retirement", async () => {
  const { encodeUserFields } = await import("../records");
  const row = { id: "u1", ...encodeUserFields("u1", { email: "a@x.com", name: "Alice" }) };
  const db = { user: { findMany: vi.fn().mockResolvedValue([row]) }, account: { findMany: vi.fn().mockResolvedValue([]) }, projectInvitation: { findMany: vi.fn().mockResolvedValue([]) }, session: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
  const ring = JSON.parse(process.env.PII_ENCRYPTION_KEYS!);
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ ...ring, next: Buffer.alloc(32, 79).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "next");
  try { expect(await convertCredentials(db, { mode: "verify" })).toMatchObject({ oldPiiKey: 2, oldTokenKey: 0 }); }
  finally { vi.unstubAllEnvs(); }
});
