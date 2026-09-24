import { describe, expect, it, vi } from "vitest";

import { expireBothVariants, isOAuthCallback, validNonce } from "../roundtrip";

/**
 * 인증 왕복 셋(`login-link` · `session-revocation` · `account-connect`)이 **각자 사본으로** 들고 있던 원시 판정
 * (audit #73). 흐름은 여전히 셋이 각자 든다(`lib/__tests__/oauth-callback-contract.test.ts`) — 여기 오는 것은
 * 사본이 갈리면 한쪽만 조용히 틀리는 조각뿐이다.
 */
describe("isOAuthCallback", () => {
  it("로그인 공급자 둘의 callback만 가로챈다", () => {
    expect(isOAuthCallback("/api/auth/callback/github")).toBe(true);
    expect(isOAuthCallback("/api/auth/callback/google")).toBe(true);
    for (const path of ["/api/auth/session", "/api/auth/callback/github/", "/api/auth/callback/githubx", "/x/api/auth/callback/github", "/api/github/callback"]) {
      expect(isOAuthCallback(path)).toBe(false);
    }
  });
});

describe("validNonce", () => {
  const nonce = Buffer.alloc(32, 11).toString("base64url");
  it("canonical 32바이트 base64url만 허용한다", () => {
    expect(validNonce(nonce)).toBe(true);
    for (const value of ["", "short", nonce + "=", nonce.slice(0, -1) + "B"]) expect(validNonce(value)).toBe(false);
  });
});

describe("expireBothVariants", () => {
  it("쿠키마다 secure·non-secure 두 변형을 Max-Age 0으로 지운다 — 로컬로 시작해 secure 호스트에서 끝난 왕복도 남지 않는다", () => {
    const set = vi.fn();
    const make = (secure: boolean) => ({ name: `${secure ? "__Host-" : ""}c`, options: { secure, path: "/" } });
    const state = (secure: boolean) => ({ name: `${secure ? "__Secure-" : ""}s`, options: { secure, path: "/" } });
    expireBothVariants({ set }, [make, state]);
    expect(set.mock.calls).toEqual([
      ["c", "", { secure: false, path: "/", maxAge: 0 }],
      ["__Host-c", "", { secure: true, path: "/", maxAge: 0 }],
      ["s", "", { secure: false, path: "/", maxAge: 0 }],
      ["__Secure-s", "", { secure: true, path: "/", maxAge: 0 }],
    ]);
  });
});
