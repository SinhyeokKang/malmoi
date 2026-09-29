import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isCodeChallenge, verifyPkce } from "../pkce";

// RFC 7636 부록 B — 외부에서 검증된 골든 값이다(스스로 계산한 값으로 대체하지 않는다).
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

describe("verifyPkce (S256)", () => {
  it("RFC 7636 부록 B 벡터가 통과한다", () => {
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
  });

  it("verifier가 한 글자만 달라도 거부한다", () => {
    expect(verifyPkce(`${VERIFIER.slice(0, -1)}l`, CHALLENGE)).toBe(false);
  });

  it("plain 비교는 없다 — verifier를 challenge 자리에 그대로 두면 거부한다", () => {
    expect(verifyPkce(VERIFIER, VERIFIER)).toBe(false);
  });

  it("verifier 형식(43–128자 unreserved) 밖이면 해시가 맞아도 거부한다", () => {
    for (const bad of ["a".repeat(42), "a".repeat(129), `${"a".repeat(42)}+`, `${"a".repeat(42)} `]) {
      expect(verifyPkce(bad, challengeOf(bad))).toBe(false);
    }
    expect(verifyPkce("", challengeOf(""))).toBe(false);
  });

  it("verifier 길이 경계 43·128자와 unreserved 기호는 받는다", () => {
    for (const ok of ["a".repeat(43), "a".repeat(128), "A-._~".repeat(9)]) {
      expect(verifyPkce(ok, challengeOf(ok))).toBe(true);
    }
  });

  it("challenge 길이가 다르면 예외 없이 거부한다", () => {
    expect(verifyPkce(VERIFIER, CHALLENGE.slice(1))).toBe(false);
    expect(verifyPkce(VERIFIER, "")).toBe(false);
  });
});

describe("isCodeChallenge", () => {
  it("S256 challenge는 패딩 없는 base64url 43자다", () => {
    expect(isCodeChallenge(CHALLENGE)).toBe(true);
    expect(isCodeChallenge(CHALLENGE.slice(1))).toBe(false);
    expect(isCodeChallenge(`${CHALLENGE}=`)).toBe(false);
    expect(isCodeChallenge(`${CHALLENGE.slice(1)}+`)).toBe(false);
  });
});
