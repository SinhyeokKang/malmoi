import { describe, expect, it } from "vitest";

import { verifiedEmailFrom } from "../email";

/**
 * **provider가 검증한 이메일만 통과시킨다** (SAAS.md §5.6 — "초대 대상 이메일과 provider가 검증한
 * 이메일이 일치해야 수락된다"). 이 함수가 `null`을 내면 `signIn`이 로그인을 거부한다.
 *
 * ⚠️ **GitHub provider는 검증 여부를 알려주지 않는다** (2026-09-05 실측:
 * `@auth/core/providers/github.js`). 공개 이메일이 없으면 `/user/emails`를 조회하긴 하지만
 * `emails.find(e => e.primary) ?? emails[0]`로 **주소만 뽑고 `verified`를 버린다** — 그리고 그
 * `emails[0]` 폴백은 미검증 주소일 수 있다. 그래서 `signIn`이 그 엔드포인트를 직접 조회하고
 * 여기로 응답을 넘긴다.
 *
 * **fail-closed다.** 모르는 모양·빠진 값·미검증은 전부 `null`이다 — `lib/auth/allow.ts`가 빈
 * 핸들을 이중으로 막는 것과 같은 계보다.
 */

describe("verifiedEmailFrom — Google", () => {
  it("email_verified가 true면 이메일을 낸다", () => {
    expect(
      verifiedEmailFrom({ provider: "google", email: "a@b.com", emailVerified: true }),
    ).toBe("a@b.com");
  });

  it("문자열 \"true\"도 받는다 — provider가 어느 쪽으로 보내도 로그인이 깨지지 않는다", () => {
    expect(
      verifiedEmailFrom({ provider: "google", email: "a@b.com", emailVerified: "true" }),
    ).toBe("a@b.com");
  });

  it("정규화해서 낸다 — User.email·초대 대조와 같은 규칙이어야 한다", () => {
    expect(
      verifiedEmailFrom({ provider: "google", email: " A@B.com ", emailVerified: true }),
    ).toBe("a@b.com");
  });

  it("email_verified가 false면 null이다", () => {
    expect(
      verifiedEmailFrom({ provider: "google", email: "a@b.com", emailVerified: false }),
    ).toBeNull();
    expect(
      verifiedEmailFrom({ provider: "google", email: "a@b.com", emailVerified: "false" }),
    ).toBeNull();
  });

  it("email_verified가 없으면 null이다 — 부재를 통과로 읽지 않는다", () => {
    expect(
      verifiedEmailFrom({ provider: "google", email: "a@b.com", emailVerified: undefined }),
    ).toBeNull();
    expect(
      verifiedEmailFrom({ provider: "google", email: "a@b.com", emailVerified: null }),
    ).toBeNull();
  });

  it("이메일이 없거나 비면 null이다", () => {
    expect(verifiedEmailFrom({ provider: "google", email: null, emailVerified: true })).toBeNull();
    expect(verifiedEmailFrom({ provider: "google", email: "", emailVerified: true })).toBeNull();
    expect(verifiedEmailFrom({ provider: "google", email: "  ", emailVerified: true })).toBeNull();
  });
});

describe("verifiedEmailFrom — GitHub", () => {
  const primary = { email: "a@b.com", primary: true, verified: true };

  it("primary이면서 verified인 주소를 낸다", () => {
    expect(verifiedEmailFrom({ provider: "github", addresses: [primary] })).toBe("a@b.com");
  });

  it("여러 개 중 primary를 고른다", () => {
    expect(
      verifiedEmailFrom({
        provider: "github",
        addresses: [
          { email: "other@b.com", primary: false, verified: true },
          primary,
        ],
      }),
    ).toBe("a@b.com");
  });

  it("정규화해서 낸다", () => {
    expect(
      verifiedEmailFrom({ provider: "github", addresses: [{ ...primary, email: "A@B.com" }] }),
    ).toBe("a@b.com");
  });

  it("primary가 미검증이면 null이다 — 다른 검증 주소로 넘어가지 않는다", () => {
    // 넘어가면 User.email이 primary가 아닌 주소가 되고, 그 사용자가 다음에 로그인할 때
    // 어느 주소가 나올지가 GitHub 설정에 따라 흔들린다. 계정의 정본 주소는 primary 하나다.
    expect(
      verifiedEmailFrom({
        provider: "github",
        addresses: [
          { email: "a@b.com", primary: true, verified: false },
          { email: "other@b.com", primary: false, verified: true },
        ],
      }),
    ).toBeNull();
  });

  it("primary가 없으면 null이다 — emails[0]으로 떨어지지 않는다", () => {
    expect(
      verifiedEmailFrom({
        provider: "github",
        addresses: [{ email: "other@b.com", primary: false, verified: true }],
      }),
    ).toBeNull();
  });

  it("빈 배열·배열이 아닌 값은 null이다 — 조회 실패가 통과가 되지 않는다", () => {
    expect(verifiedEmailFrom({ provider: "github", addresses: [] })).toBeNull();
    expect(verifiedEmailFrom({ provider: "github", addresses: null })).toBeNull();
    expect(verifiedEmailFrom({ provider: "github", addresses: undefined })).toBeNull();
    expect(verifiedEmailFrom({ provider: "github", addresses: "boom" })).toBeNull();
    expect(verifiedEmailFrom({ provider: "github", addresses: { email: "a@b.com" } })).toBeNull();
  });

  it("항목 모양이 다르면 그 항목을 무시한다 — 남의 응답을 신뢰하지 않는다", () => {
    expect(
      verifiedEmailFrom({
        provider: "github",
        addresses: [{ email: 123, primary: true, verified: true }],
      }),
    ).toBeNull();
    expect(
      verifiedEmailFrom({ provider: "github", addresses: [{ primary: true, verified: true }] }),
    ).toBeNull();
    expect(
      verifiedEmailFrom({ provider: "github", addresses: [{ email: "a@b.com" }] }),
    ).toBeNull();
  });
});
