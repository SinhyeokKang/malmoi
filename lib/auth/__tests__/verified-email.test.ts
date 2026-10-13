import { describe, expect, it } from "vitest";

import { verifiedEmailFrom } from "../email";

/**
 * **provider가 검증한 이메일만 통과시킨다** (ARCHITECTURE §6.02 — "초대 대상 이메일과 provider가 검증한
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

/**
 * **GitLab은 `/api/v4/user`의 `email` + `confirmed_at`이다** (gitlab-oauth design §2 · D1). `email`은 주 이메일이고,
 * GitLab은 주 이메일을 바꾸면 새 주소를 `unconfirmed_email`에 두므로 `email`이 미확인이 되는 길은 **계정 자체가 미확인**인
 * 경우뿐이다 — 그것을 `confirmed_at`이 가른다. `public_email`은 보지 않는다(T0 실측에서 null이었다).
 */
describe("verifiedEmailFrom — GitLab", () => {
  const confirmedAt = "2026-10-13T03:00:00.000Z";

  it("email이 있고 confirmed_at이 비어 있지 않은 문자열이면 낸다", () => {
    expect(verifiedEmailFrom({ provider: "gitlab", email: "a@b.com", confirmedAt })).toBe("a@b.com");
  });

  it("정규화해서 낸다 — 대소문자·공백", () => {
    expect(verifiedEmailFrom({ provider: "gitlab", email: " A@B.com ", confirmedAt })).toBe("a@b.com");
  });

  it("confirmed_at이 null·없음·빈 문자열이면 null이다 — 미확인 계정을 통과시키지 않는다", () => {
    expect(verifiedEmailFrom({ provider: "gitlab", email: "a@b.com", confirmedAt: null })).toBeNull();
    expect(verifiedEmailFrom({ provider: "gitlab", email: "a@b.com", confirmedAt: undefined })).toBeNull();
    expect(verifiedEmailFrom({ provider: "gitlab", email: "a@b.com", confirmedAt: "" })).toBeNull();
    expect(verifiedEmailFrom({ provider: "gitlab", email: "a@b.com", confirmedAt: "   " })).toBeNull();
  });

  it("confirmed_at이 문자열이 아니면 null이다 — 참 같은 값을 통과로 읽지 않는다", () => {
    expect(verifiedEmailFrom({ provider: "gitlab", email: "a@b.com", confirmedAt: true })).toBeNull();
    expect(verifiedEmailFrom({ provider: "gitlab", email: "a@b.com", confirmedAt: 1 })).toBeNull();
  });

  it("email이 없거나 비면 null이다", () => {
    expect(verifiedEmailFrom({ provider: "gitlab", email: undefined, confirmedAt })).toBeNull();
    expect(verifiedEmailFrom({ provider: "gitlab", email: "", confirmedAt })).toBeNull();
    expect(verifiedEmailFrom({ provider: "gitlab", email: "  ", confirmedAt })).toBeNull();
    expect(verifiedEmailFrom({ provider: "gitlab", email: 42, confirmedAt })).toBeNull();
  });
});
