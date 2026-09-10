import { routes } from "@/lib/routes";

import { createHash } from "node:crypto";
import { hashSessionToken } from "@/lib/credentials/crypto";

const PURPOSE = "malmoi/session-revocation";
export type Challenge = {
  userId: string;
  provider: "github" | "google";
  providerAccountId: string;
  sessionDigest: string;
  stateDigest: string;
};
export type Outcome = "cancelled" | "revoked" | "expired" | "invalid" | "wrong-account" | "unavailable";
export function challengePrefix(userId?: string): string {
  return JSON.stringify(userId === undefined ? [PURPOSE, "v1"] : [PURPOSE, "v1", userId]).slice(0, -1) + ",";
}
export function challengeIdentifier(c: Challenge): string {
  return JSON.stringify([PURPOSE, "v1", c.userId, c.provider, c.providerAccountId, c.sessionDigest, c.stateDigest]);
}
export function parseChallengeIdentifier(identifier: string): Challenge | null {
  try {
    const a: unknown = JSON.parse(identifier);
    if (!Array.isArray(a) || a.length !== 7) return null;
    const [purpose, version, userId, provider, providerAccountId, sessionDigest, stateDigest] = a;
    if (purpose !== PURPOSE || version !== "v1" || typeof userId !== "string" || !userId ||
      (provider !== "github" && provider !== "google") || typeof providerAccountId !== "string" || !providerAccountId ||
      typeof sessionDigest !== "string" || !/^sha256:v1:[a-f0-9]{64}$/.test(sessionDigest) ||
      typeof stateDigest !== "string" || !/^[a-f0-9]{64}$/.test(stateDigest)) return null;
    const result = { userId, provider, providerAccountId, sessionDigest, stateDigest };
    return challengeIdentifier(result) === identifier ? result : null;
  } catch { return null; }
}
export function nonceHash(raw: string): string {
  return createHash("sha256").update(`${PURPOSE}/nonce/v1\0${raw}`).digest("hex");
}
export function stateHash(raw: string): string {
  return createHash("sha256").update(`${PURPOSE}/state/v1\0${raw}`).digest("hex");
}
export function validNonce(raw: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(raw) && Buffer.from(raw, "base64url").toString("base64url") === raw;
}
export function checkChallenge(c: Challenge, input: {
  provider: string; providerAccountId: string; sessionToken: string; state: string; expires: Date; now: Date;
}): "ok" | "expired" | "invalid" | "wrong-account" {
  if (!(input.expires.getTime() > input.now.getTime())) return "expired";
  if (!input.sessionToken || !input.state || c.sessionDigest !== hashSessionToken(input.sessionToken) || c.stateDigest !== stateHash(input.state)) return "invalid";
  if (c.provider !== input.provider || c.providerAccountId !== input.providerAccountId) return "wrong-account";
  return "ok";
}
export function revocationCookie(secure: boolean) {
  return { name: `${secure ? "__Host-" : ""}malmoi-session-revocation`, options: {
    secure, httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 300,
  } };
}
/**
 * ⚠️ **`?sessions=revoked`의 유일한 생산자다** (소비자는 `http.ts`). 8-1a에서 로그인 화면이
 * `/signin`으로 옮겨갈 때 이 자리를 놓치면 **루트 껍데기가 쿼리를 버려** 회수 완료 피드백이
 * 원리적으로 뜨지 않는다 — 보내는 쪽과 받는 쪽이 갈라진 채 통과하는 부류다
 * (POSTMORTEM 2026-09-06).
 */
export function outcomeUrl(outcome: Outcome): string {
  return outcome === "revoked" ? routes.signIn({ sessions: "revoked" }) : `/account?sessionRevocation=${outcome}`;
}

/** Auth.js encrypts state with the cookie name as salt, so it cannot be renamed into ordinary login. */
export function revocationStateCookie(secure: boolean) {
  return { name: `${secure ? "__Secure-" : ""}malmoi-revocation-state`, options: {
    secure, httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 900,
  } };
}
