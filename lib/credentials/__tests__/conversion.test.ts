import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { convertCredentials } from "../conversion";
import { credentialCommand, credentialTarget, finalizeDeploy } from "../command";
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
  const a = { userId: "u1", provider: "github-app", providerAccountId: "1", access_token: null, refresh_token: null };
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
it("dev direct host passes, and sslmode=verify-full alone is the only accepted query", async () => {
  const { credentialTarget } = await import("../command");
  const direct = "postgresql://postgres:fixture@db.bfugwmjubgmmroevrave.supabase.co:5432/postgres";
  expect(credentialTarget({ CREDENTIAL_TARGET: "dev", DIRECT_URL: direct })).toEqual({ target: "dev", url: direct });
  expect(credentialTarget({ CREDENTIAL_TARGET: "dev", DIRECT_URL: `${direct}?sslmode=verify-full` }).target).toBe("dev");
  // hosted allowlist는 그대로다 — prod ref를 dev 변수에, 다른 호스트를 hosted target에 넣으면 거절한다.
  for (const url of [
    "postgresql://postgres:fixture@db.xgsyyapzkpbdtkrprlmn.supabase.co:5432/postgres",
    "postgresql://postgres:fixture@db.example.com:5432/postgres?sslmode=verify-full",
  ]) expect(() => credentialTarget({ CREDENTIAL_TARGET: "dev", DIRECT_URL: url })).toThrow(CredentialError);
});
describe("self-hosted target", () => {
  const target = (url: string | undefined, extra: Record<string, string> = {}) => credentialTarget({ CREDENTIAL_TARGET: "self-hosted", DIRECT_URL: url, ...extra });
  it("reads DIRECT_URL — never DIRECT_URL_PROD", () => {
    const url = "postgresql://malmoi:fixture@postgres:5432/malmoi";
    expect(target(url)).toEqual({ target: "self-hosted", url });
    expect(() => target(undefined, { DIRECT_URL_PROD: url })).toThrow(CredentialError);
  });
  it("the compose service host `postgres` may omit TLS or disable it", () => {
    for (const query of ["", "?sslmode=disable", "?sslmode=verify-full"]) {
      expect(target(`postgresql://malmoi:fixture@postgres:5432/malmoi${query}`).target).toBe("self-hosted");
    }
  });
  it("any other host requires sslmode=verify-full, and verify-full alone passes", () => {
    const url = "postgres://malmoi:fixture@db.internal.example:6000/malmoi";
    expect(target(`${url}?sslmode=verify-full`).target).toBe("self-hosted");
    for (const query of ["", "?sslmode=disable", "?sslmode=require", "?sslmode=verify-ca"]) {
      expect(() => target(`${url}${query}`)).toThrow(CredentialError);
    }
    // 호스트 이름이 `postgres`로 시작하기만 하는 것은 Compose 내부 서비스가 아니다.
    expect(() => target("postgresql://malmoi:fixture@postgres.example.com:5432/malmoi")).toThrow(CredentialError);
  });
  it("pg query parameters cannot override host, user, port or TLS", () => {
    for (const base of ["postgresql://malmoi:fixture@postgres:5432/malmoi", "postgresql://malmoi:fixture@db.internal.example:5432/malmoi?sslmode=verify-full"]) {
      const join = base.includes("?") ? "&" : "?";
      for (const query of ["user=postgres", "port=6543", "password=override", "host=elsewhere", "options=unsafe", "sslmode=disable&sslmode=verify-full", "dbname=postgres"]) {
        expect(() => target(`${base}${join}${query}`), query).toThrow(CredentialError);
      }
    }
  });
  it("rejects non-postgres schemes, missing user or database, and hosted Supabase projects", () => {
    for (const url of [
      "mysql://malmoi:fixture@postgres:5432/malmoi",
      "postgresql://postgres:5432/malmoi",
      "postgresql://malmoi:fixture@postgres:5432/",
      "postgresql://malmoi:fixture@postgres:5432/a/b",
      "postgresql://postgres:fixture@db.xgsyyapzkpbdtkrprlmn.supabase.co:5432/postgres?sslmode=verify-full",
      "postgresql://postgres.bfugwmjubgmmroevrave:fixture@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full",
      "not a url",
    ]) expect(() => target(url), url).toThrow(CredentialError);
  });
  it("rejection never echoes the URL", () => {
    try { target("postgresql://malmoi:secret@db.internal.example/malmoi"); } catch (error) { expect(String(error)).not.toContain("secret"); }
  });
});
describe("finalizeDeploy", () => {
  const env = { PATH: "/bin", PRISMA_TARGET: "prod", DIRECT_URL: "u" };
  it("prod goes through db:deploy with PRISMA_TARGET=prod", () => {
    expect(finalizeDeploy("prod", env)).toEqual({ args: ["db:deploy"], env: { ...env, PRISMA_TARGET: "prod" } });
  });
  it("dev runs migrate deploy with PRISMA_TARGET=dev", () => {
    expect(finalizeDeploy("dev", env)).toEqual({ args: ["exec", "prisma", "migrate", "deploy"], env: { ...env, PRISMA_TARGET: "dev" } });
  });
  it("self-hosted runs migrate deploy against DIRECT_URL and never sets PRISMA_TARGET", () => {
    const plan = finalizeDeploy("self-hosted", env);
    expect(plan.args).toEqual(["exec", "prisma", "migrate", "deploy"]);
    expect(Object.hasOwn(plan.env, "PRISMA_TARGET")).toBe(false);
    expect(plan.env).toEqual({ PATH: "/bin", DIRECT_URL: "u" });
  });
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
