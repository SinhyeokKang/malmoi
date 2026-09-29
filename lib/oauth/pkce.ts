import { createHash, timingSafeEqual } from "node:crypto";

/**
 * PKCE `S256` (RFC 7636 §4.6). `plain`은 받지 않는다 — authorize가 이미 거부하므로 여기엔 갈래가 없다.
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

/** RFC 7636 §4.1 — unreserved 43–128자. 형식 밖의 verifier는 해시가 맞아도 받지 않는다. */
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

/** sha256 32바이트의 패딩 없는 base64url은 정확히 43자다. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function isCodeChallenge(value: string): boolean {
  return CHALLENGE.test(value);
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier) || !isCodeChallenge(challenge)) return false;
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  return timingSafeEqual(computed, Buffer.from(challenge));
}
