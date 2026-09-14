import { expect, it } from "vitest";
import { connectChallengeIdentifier, parseConnectChallenge, connectChallengePrefix, planLoginMethodLink, connectOutcome, isUnlinkOutcome } from "../plan";
const c = { userId: "owner", provider: "google" as const, emailLookup: "hmac:v1:k1:" + "a".repeat(64), sessionDigest: "sha256:v1:" + "b".repeat(64), stateDigest: "c".repeat(64) };
const input = { challenge: { ...c, expires: new Date(1000) }, sessionUserId: "owner", provider: "google", providerLookup: c.emailLookup, existing: null, state: c.stateDigest, sessionToken: c.sessionDigest, now: new Date(999) };
it("세션·state·검증 이메일이 맞을 때만 연결을 허용한다", () => { expect(planLoginMethodLink(input)).toBe("connected"); });
it.each([
  [{ challenge: null }, "expired"],
  [{ now: new Date(1000) }, "expired"],
  [{ sessionUserId: "other" }, "wrong-user"],
  [{ sessionToken: "different-session" }, "wrong-user"],
  [{ state: "different-state" }, "failed"],
  [{ provider: "github" }, "failed"],
  [{ providerLookup: null }, "unverified"],
  [{ providerLookup: "different-email" }, "email-mismatch"],
  [{ existing: { userId: "owner" } }, "already-connected"],
  [{ existing: { userId: "other" } }, "taken-by-other"],
] as const)("잘못된 증명 %j는 %s로 거부한다", (change, outcome) => { expect(planLoginMethodLink({ ...input, ...change })).toBe(outcome); });
it("challenge 식별자는 목적·사용자 접두에 묶이고 원문 이메일이 없다", () => {
  const id = connectChallengeIdentifier(c);
  expect(id.startsWith(connectChallengePrefix("owner"))).toBe(true);
  expect(id.startsWith(connectChallengePrefix("own"))).toBe(false);
  expect(parseConnectChallenge(id)).toEqual(c);
  expect(parseConnectChallenge(id.replace("malmoi/account-connect", "malmoi/login-link"))).toBeNull();
  expect(parseConnectChallenge("{}" )).toBeNull();
});
it.each(["connected", "email-mismatch", "already-connected", "taken-by-other", "expired", "cancelled", "unverified", "wrong-user", "failed"])("연결 결과 %s를 읽는다", (value) => expect(connectOutcome(value)).toBe(value));
it.each([undefined, "__proto__", "nope", "revoked", "wrong-account"])("낯선 결과 %s는 무시한다", (value) => expect(connectOutcome(value)).toBeNull());
it.each(["disconnected", "last-method", "unavailable"])("해제 결과 %s를 허용한다", (value) => expect(isUnlinkOutcome(value)).toBe(true));
it.each([undefined, "nope", "wrong-account", "__proto__"])("해제 외 결과 %s는 거부한다", (value) => expect(isUnlinkOutcome(value)).toBe(false));
