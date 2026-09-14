import "server-only";
import { randomBytes } from "node:crypto";
import { requireEnv as readEnv } from "@/lib/env";
import { CredentialError, decrypt, emailLookup, encrypt, parseKeyring } from "./crypto";

function requireEnv(name: string): string {
  try { return readEnv(name); } catch { throw new CredentialError(); }
}

export function validateCredentialKeys(): void {
  const all: string[] = [];
  for (const kind of ["TOKEN", "PII"] as const) {
    const ring = keys(kind);
    if (!ring.has(requireEnv(`${kind}_ENCRYPTION_ACTIVE_KEY_ID`))) throw new CredentialError();
    for (const key of ring.values()) all.push(key.toString("base64"));
  }
  const lookup = parseKeyring(JSON.stringify({ [requireEnv("EMAIL_LOOKUP_KEY_ID")]: requireEnv("EMAIL_LOOKUP_KEY") }));
  for (const key of lookup.values()) all.push(key.toString("base64"));
  if (new Set(all).size !== all.length) throw new CredentialError();
}

/**
 * PII 저장이 **설정돼 있는가**. 행 하나의 손상과 서브시스템 장애를 가르는 자리다 —
 * 이 검사 없이 행마다 실패를 삼키면 **키가 통째로 빠진 장애가 "전원 이름 없음"으로 보인다**
 * (POSTMORTEM 2026-09-03의 "실패한 조회를 '없음'으로 읽는다"와 같은 부류).
 * 읽기는 값에 박힌 kid를 쓰므로 active kid는 묻지 않는다 — keyring이 서 있는지만 본다.
 */
export function validatePiiReadKeys(): void { keys("PII"); }

export function validatePiiWriteKey(): void {
  if (!keys("PII").has(requireEnv("PII_ENCRYPTION_ACTIVE_KEY_ID"))) throw new CredentialError();
}

export function validateTokenWriteKey(): void {
  if (!keys("TOKEN").has(requireEnv("TOKEN_ENCRYPTION_ACTIVE_KEY_ID"))) throw new CredentialError();
}

type PiiContext = { table: "User"; id: string; field: "email" | "name" | "image" } | { table: "ProjectInvitation"; id: string; field: "email"; projectId: string };
type TokenContext = { userId: string; providerAccountId: string; field: "access_token" | "refresh_token" };
function keys(kind: "PII" | "TOKEN") { return parseKeyring(requireEnv(`${kind}_ENCRYPTION_KEYS`)); }
function piiAAD(ctx: PiiContext, kid: string): string {
  return JSON.stringify(["malmoi/pii", "v1", kid, ctx.table, ctx.id, ctx.field, ctx.table === "User" ? null : ctx.projectId]);
}
function tokenAAD(ctx: TokenContext, kid: string): string {
  return JSON.stringify(["malmoi/github-app-token", "v1", kid, ctx.userId, "github-app", ctx.providerAccountId, ctx.field]);
}
function seal(value: string | null, kind: "PII" | "TOKEN", aad: (kid: string) => string): string | null {
  if (value === null) return null;
  const kid = requireEnv(`${kind}_ENCRYPTION_ACTIVE_KEY_ID`);
  const key = keys(kind).get(kid);
  if (!key) throw new CredentialError();
  return encrypt(value, aad(kid), kid, key, randomBytes(12));
}
function open(value: string | null, kind: "PII" | "TOKEN", aad: (kid: string) => string): string | null {
  if (value === null) return null;
  const kid = value.split(":")[2];
  if (!kid) throw new CredentialError();
  return decrypt(value, aad(kid), keys(kind));
}
export function sealPii(value: string | null, ctx: PiiContext) { return seal(value, "PII", kid => piiAAD(ctx, kid)); }
export function openPii(value: string | null, ctx: PiiContext) { return open(value, "PII", kid => piiAAD(ctx, kid)); }
export function sealToken(value: string | null, ctx: TokenContext) { return seal(value, "TOKEN", kid => tokenAAD(ctx, kid)); }
export function openToken(value: string | null, ctx: TokenContext) { return open(value, "TOKEN", kid => tokenAAD(ctx, kid)); }
export function lookupEmail(email: string, projectId?: string): string {
  const kid = requireEnv("EMAIL_LOOKUP_KEY_ID");
  const key = parseKeyring(JSON.stringify({ [kid]: requireEnv("EMAIL_LOOKUP_KEY") })).get(kid);
  if (!key) throw new CredentialError();
  return emailLookup(email, projectId === undefined ? "user" : `invitation:${projectId}`, key, kid);
}
