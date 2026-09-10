import { expect, it } from "vitest";
import { hashSessionToken } from "@/lib/credentials/crypto";
import { challengeIdentifier, parseChallengeIdentifier, challengePrefix, nonceHash, stateHash, validNonce, checkChallenge, revocationCookie, outcomeUrl } from "../policy";
const nonce = Buffer.alloc(32, 11).toString("base64url");
const context = { userId: "u1", provider: "github" as const, providerAccountId: "gh1", sessionDigest: hashSessionToken("raw-session"), stateDigest: stateHash("fresh-state") };
const input = { provider: "github", providerAccountId: "gh1", sessionToken: "raw-session", state: "fresh-state", expires: new Date(100), now: new Date(99) };
it("확인 요청은 사용자·공급자 계정·세션·OAuth state를 담되 원문은 저장하지 않는다", () => {
  const id = challengeIdentifier(context);
  expect(parseChallengeIdentifier(id)).toEqual(context);
  expect(id.startsWith(challengePrefix("u1"))).toBe(true);
  expect(id.startsWith(challengePrefix("u10"))).toBe(false);
  expect(id).not.toContain("raw-session"); expect(id).not.toContain("fresh-state");
  expect(nonceHash(nonce)).not.toBe(nonce); expect(nonceHash(nonce)).not.toBe(stateHash(nonce));
});
it("모호한 ID·잘못된 목적·알 수 없는 provider·여분 필드를 거부한다", () => {
  for (const value of ["{}", "[]", "null", challengeIdentifier(context).replace("v1", "v2"), challengeIdentifier(context).replace("github", "github-app"), challengeIdentifier(context).replace(/]$/, ',"extra"]')]) expect(parseChallengeIdentifier(value)).toBeNull();
});
it("nonce는 canonical 32바이트 base64url만 허용한다", () => {
  expect(validNonce(nonce)).toBe(true);
  for (const value of ["", "short", nonce + "=", nonce.slice(0, -1) + "B"]) expect(validNonce(value)).toBe(false);
});
it("현재 세션·state·공급자 ID가 일치한 미만료 요청만 통과한다", () => {
  expect(checkChallenge(context, input)).toBe("ok");
  expect(checkChallenge(context, { ...input, now: new Date(100) })).toBe("expired");
  expect(checkChallenge(context, { ...input, expires: new Date(NaN) })).toBe("expired");
  expect(checkChallenge(context, { ...input, sessionToken: "other-session" })).toBe("invalid");
  expect(checkChallenge(context, { ...input, state: "older-state" })).toBe("invalid");
  expect(checkChallenge(context, { ...input, providerAccountId: "other" })).toBe("wrong-account");
  expect(checkChallenge(context, { ...input, provider: "google" })).toBe("wrong-account");
});
it("HTTPS 확인 쿠키는 Host 범위·HttpOnly·5분이며 성공과 실패 URL은 고정이다", () => {
  expect(revocationCookie(true)).toMatchObject({ name: "__Host-malmoi-session-revocation", options: { secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 } });
  expect(revocationCookie(false)).toMatchObject({ name: "malmoi-session-revocation", options: { secure: false } });
  expect(outcomeUrl("revoked")).toBe("/?sessions=revoked");
  expect(outcomeUrl("unavailable")).toBe("/account?sessionRevocation=unavailable");
});
