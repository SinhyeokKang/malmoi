import "server-only";
import { normalizeEmail } from "@/lib/auth/email";
import { requireEnv } from "@/lib/env";
import { CredentialError } from "./crypto";
import { lookupEmail, openPii, openToken, sealPii, sealToken } from "./storage";

export type MigrationMode = "backfill" | "verify" | "rotate-token" | "rotate-pii" | "reindex";
export function classifyCredential(value: string | null): "null" | "envelope" | "legacy" {
  return value === null ? "null" : (value.startsWith("enc:") || /^[^:]+:v[0-9]+:/.test(value)) ? "envelope" : "legacy";
}
export type AccountFields = { userId: string; provider: string; providerAccountId: string; access_token: string | null; refresh_token: string | null; id_token: string | null };
type AccountPatch = Pick<AccountFields, "access_token" | "refresh_token" | "id_token">;
// ⚠️ **`plan*`이 아니다** — 이 리포의 `plan*`은 순수 함수인데 이 둘은 봉투를 열고 다시 봉인한다(키를 env에서 읽는다, launch-readiness L7.1).
export function migrateAccountFields(row: AccountFields, mode: MigrationMode): AccountPatch | null {
  const hasSecrets = [row.access_token, row.refresh_token, row.id_token].some(v => v !== null);
  if (row.provider === "github" || row.provider === "google") {
    if (!hasSecrets) return null;
    if (mode !== "backfill") throw new CredentialError();
    return { access_token: null, refresh_token: null, id_token: null };
  }
  if (row.provider !== "github-app") {
    if (hasSecrets) throw new CredentialError();
    return null;
  }
  if (row.id_token !== null) throw new CredentialError();
  const formats = [row.access_token, row.refresh_token].filter(v => v !== null).map(classifyCredential);
  if (new Set(formats).size > 1) throw new CredentialError();
  if (formats.includes("legacy") && [row.access_token, row.refresh_token].some(v => v?.includes(":"))) throw new CredentialError();
  const result: AccountPatch = { access_token: row.access_token, refresh_token: row.refresh_token, id_token: null };
  for (const field of ["access_token", "refresh_token"] as const) {
    const value = row[field];
    if (value === null) continue;
    const ctx = { userId: row.userId, providerAccountId: row.providerAccountId, field };
    const legacy = classifyCredential(value) === "legacy";
    if (legacy && mode !== "backfill") throw new CredentialError();
    const plain = legacy ? value : openToken(value, ctx)!;
    if (legacy || (mode === "rotate-token" && value.split(":")[2] !== requireEnv("TOKEN_ENCRYPTION_ACTIVE_KEY_ID"))) result[field] = sealToken(plain, ctx);
  }
  return result.access_token === row.access_token && result.refresh_token === row.refresh_token ? null : result;
}
export type PersonalFields = { id: string; email: string; emailLookup?: string | null; name?: string | null; image?: string | null; projectId?: string };
type PersonalPatch = { email?: string; emailLookup?: string; name?: string | null; image?: string | null };
function readEmail(row: PersonalFields, table: "User" | "ProjectInvitation"): string {
  if (typeof row.email !== "string" || !row.email) throw new CredentialError();
  const context = table === "User" ? { table, id: row.id, field: "email" as const } : { table, id: row.id, field: "email" as const, projectId: row.projectId! };
  if (table === "ProjectInvitation" && !row.projectId) throw new CredentialError();
  const email = classifyCredential(row.email) === "legacy" ? row.email : openPii(row.email, context)!;
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) throw new CredentialError();
  return normalized;
}
export function assertUniqueEmails(rows: PersonalFields[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const email = readEmail(row, "User");
    if (seen.has(email)) throw new CredentialError();
    seen.add(email);
  }
}
export function migratePersonalFields(row: PersonalFields, table: "User" | "ProjectInvitation", mode: MigrationMode): PersonalPatch | null {
  const email = readEmail(row, table);
  const fields = table === "User" ? [row.email, row.name, row.image] : [row.email];
  const formats = fields.filter((v): v is string => v != null).map(classifyCredential);
  if ((row.emailLookup != null || formats.includes("envelope")) && formats.includes("legacy")) throw new CredentialError();
  const expected = lookupEmail(email, table === "User" ? undefined : row.projectId);
  const result: PersonalPatch = {};
  if (row.emailLookup !== expected) {
    if (mode === "reindex" || (mode === "backfill" && row.emailLookup == null)) result.emailLookup = expected;
    else throw new CredentialError();
  }
  for (const field of (table === "User" ? ["email", "name", "image"] : ["email"]) as ("email" | "name" | "image")[]) {
    const value = row[field];
    if (value == null) continue;
    const legacy = classifyCredential(value) === "legacy";
    if (legacy && mode !== "backfill") throw new CredentialError();
    const ctx = table === "User" ? { table, id: row.id, field } : { table, id: row.id, projectId: row.projectId!, field: "email" as const };
    const plain = field === "email" ? email : legacy ? value : openPii(value, ctx)!;
    if (legacy || (mode === "rotate-pii" && value.split(":")[2] !== requireEnv("PII_ENCRYPTION_ACTIVE_KEY_ID"))) result[field] = sealPii(plain, ctx)!;
  }
  return Object.keys(result).length === 0 ? null : result;
}
export function isHashedSession(value: string): boolean { return /^sha256:v1:[a-f0-9]{64}$/.test(value); }
