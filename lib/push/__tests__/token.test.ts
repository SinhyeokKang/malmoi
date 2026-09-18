import { describe, expect, it } from "vitest";

import { hashInviteToken } from "@/lib/auth/invitation";

import { generatePushToken, hashPushToken } from "../token";

/**
 * 프로젝트별 push 토큰 (PRODUCT §7.8). **원문은 저장하지 않는다** — 발급 시 한 번 보여주고 해시만
 * `Project.pushTokenHash`에 남긴다. 인증은 `sha256(원문)`으로 행을 **조회**하므로 비교 자체가 없다 —
 * `timingSafeEqual`이 필요 없는 이유다 (`hashInviteToken`의 주석과 같은 판단).
 *
 * ⚠️ 해시 규칙은 초대 토큰과 **같은 sha256 hex**다. 두 곳이 갈리면 "해시 저장 규칙이 한 곳에 모인다"(PRODUCT §7.8)가
 * 거짓이 된다 — 아래가 두 함수를 같은 입력으로 대조한다.
 */

describe("hashPushToken", () => {
  it("같은 입력은 같은 해시다", () => {
    expect(hashPushToken("tok_1")).toBe(hashPushToken("tok_1"));
  });

  it("sha256 hex다 — 64자, 소문자 16진", () => {
    expect(hashPushToken("hello")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPushToken("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("초대 토큰과 같은 규칙이다 — 해시 저장 규칙은 한 곳에 모인다 (PRODUCT §7.8)", () => {
    for (const raw of ["a", "push_token_xyz", generatePushToken()]) {
      expect(hashPushToken(raw)).toBe(hashInviteToken(raw));
    }
  });

  it("원문이 해시에 그대로 들어 있지 않다", () => {
    const raw = generatePushToken();
    expect(hashPushToken(raw)).not.toContain(raw);
  });
});

describe("generatePushToken", () => {
  it("32바이트 난수 — base64url 43자, 패딩 없음", () => {
    const token = generatePushToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("호출마다 다르다 — 반환만 하고 어디에도 저장하지 않는다", () => {
    const seen = new Set(Array.from({ length: 20 }, () => generatePushToken()));
    expect(seen.size).toBe(20);
  });

  it("Bearer 헤더에 그대로 실을 수 있다 — 공백·비ASCII가 없다", () => {
    for (let i = 0; i < 20; i += 1) expect(generatePushToken()).toMatch(/^[\x21-\x7e]+$/);
  });
});
