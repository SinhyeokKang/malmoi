import { describe, expect, it } from "vitest";

import { freshVerifiedEmail, maskEmail, normalizeEmail, planEmailRefresh } from "../email";

/**
 * 이메일 정규화 — **trim + 소문자, 그 이상은 하지 않는다**.
 *
 * 이 함수가 하는 일보다 **하지 않는 일**이 중요하다. gmail의 점·`+` 태그를 우리가 접으면
 * provider가 준 주소를 재해석하는 것이고, 그 결과 **다른 사람의 초대와 일치시킬 수 있다.**
 * 저장(`ProjectInvitation.email`·`User.email`)과 비교가 같은 함수를 지나야 조회가 대소문자로
 * 갈리지 않는다.
 */

describe("normalizeEmail — 정규화 범위", () => {
  it("앞뒤 공백을 제거하고 소문자로 만든다", () => {
    expect(normalizeEmail(" A@B.com ")).toBe("a@b.com");
  });

  it("gmail의 점과 + 태그를 접지 않는다 — 다른 주소를 같은 것으로 만들면 초대가 오배송된다", () => {
    expect(normalizeEmail("a.b+c@Gmail.com")).toBe("a.b+c@gmail.com");
  });

  it("유니코드 로컬파트를 그대로 둔다", () => {
    expect(normalizeEmail("김철수@example.com")).toBe("김철수@example.com");
    expect(normalizeEmail("Ünïcode@Example.COM")).toBe("ünïcode@example.com");
  });

  it("도메인만 다른 대소문자는 같은 값이 된다", () => {
    expect(normalizeEmail("user@EXAMPLE.com")).toBe(normalizeEmail("USER@example.com"));
  });

  it("빈 문자열·공백만은 빈 문자열이다 — 판정은 호출부가 한다", () => {
    expect(normalizeEmail("")).toBe("");
    expect(normalizeEmail("   ")).toBe("");
  });

  it("멱등이다 — 저장된 값을 다시 정규화해도 같다", () => {
    const once = normalizeEmail("  Foo.Bar+tag@Example.COM ");
    expect(normalizeEmail(once)).toBe(once);
  });

  it("인자를 바꾸지 않는다", () => {
    const raw = " A@B.com ";
    normalizeEmail(raw);
    expect(raw).toBe(" A@B.com ");
  });
});

/**
 * **기존 사용자의 `User.email`은 첫 로그인 값으로 굳는다** — OAuth 재로그인은 `updateUser`를 부르지 않는다
 * (`@auth/core/lib/actions/callback/handle-login.js`). primary를 A→B로 바꾼 사람은 B로 온 초대를 영영
 * `email-mismatch`로 받고, A를 버린 뒤에도 A로 온 초대를 수락한다 (Codex 감사 2026-09-06 #5 / code-review 🟡8).
 * 재로그인 때 provider의 현재 검증 이메일로 갱신한다. **새 주소가 다른 User의 것이면 건너뛴다** —
 * 로그인을 막지 않고, 자동 병합도 하지 않는다 (2026-09-06 결정).
 */
describe("planEmailRefresh — 재로그인 시 저장 이메일 갱신 판정", () => {
  it("같으면 keep", () => {
    expect(planEmailRefresh({ stored: "a@x.com", fresh: "a@x.com", takenByOther: false, loginMethods: 1 })).toBe("keep");
  });

  it("대소문자·공백만 다르면 keep — 정규화 뒤 같다", () => {
    expect(planEmailRefresh({ stored: "a@x.com", fresh: " A@X.com ", takenByOther: false, loginMethods: 1 })).toBe("keep");
  });

  it("다르고 비어 있지 않으면 update", () => {
    expect(planEmailRefresh({ stored: "a@x.com", fresh: "b@x.com", takenByOther: false, loginMethods: 1 })).toBe("update");
  });

  it("다른 User가 쓰는 주소면 conflict — 갱신도 병합도 하지 않는다", () => {
    expect(planEmailRefresh({ stored: "a@x.com", fresh: "b@x.com", takenByOther: true, loginMethods: 1 })).toBe("conflict");
  });

  /**
   * ⚠️ **"같은 주소면 언제나 keep"은 병합 시점에만 참이었다** (ARCHITECTURE "계정 병합"). 병합 뒤
   * 한쪽 provider에서 주소를 바꾸면 로그인할 때마다 `User.email`이 뒤집히고, 초대 대조(ARCHITECTURE §6.02)가
   * 그 값 위에 선다. 대가는 병합한 사용자의 이메일이 provider를 안 따라가는 것이다.
   */
  it("로그인 수단이 둘 이상이면 주소가 갈려도 언제나 keep", () => {
    expect(planEmailRefresh({ stored: "a@x.com", fresh: "b@x.com", takenByOther: false, loginMethods: 2 })).toBe("keep");
    expect(planEmailRefresh({ stored: "a@x.com", fresh: "b@x.com", takenByOther: true, loginMethods: 2 })).toBe("keep");
  });

  it("수단이 하나면 동작이 그대로다", () => {
    expect(planEmailRefresh({ stored: "a@x.com", fresh: "b@x.com", takenByOther: false, loginMethods: 1 })).toBe("update");
    expect(planEmailRefresh({ stored: "a@x.com", fresh: "b@x.com", takenByOther: false, loginMethods: 0 })).toBe("update");
  });

  it("검증 이메일이 없으면(빈 값·null) keep — 부재를 갱신으로 읽지 않는다", () => {
    expect(planEmailRefresh({ stored: "a@x.com", fresh: "", takenByOther: false, loginMethods: 1 })).toBe("keep");
    expect(planEmailRefresh({ stored: "a@x.com", fresh: null, takenByOther: false, loginMethods: 1 })).toBe("keep");
  });
});

describe("freshVerifiedEmail — signIn 콜백의 profile에서 현재 검증 이메일을 꺼낸다", () => {
  it("github: 우리 userinfo가 만든 profile.email을 그대로 쓴다 (검증 실패면 빈 문자열이다)", () => {
    expect(freshVerifiedEmail("github", { email: "A@x.com" })).toBe("a@x.com");
    expect(freshVerifiedEmail("github", { email: "" })).toBeNull();
  });

  it("google: email_verified가 참일 때만", () => {
    expect(freshVerifiedEmail("google", { email: "g@x.com", email_verified: true })).toBe("g@x.com");
    expect(freshVerifiedEmail("google", { email: "g@x.com", email_verified: false })).toBeNull();
  });

  it("모르는 provider·비객체 profile은 null", () => {
    expect(freshVerifiedEmail("apple", { email: "x@y.com" })).toBeNull();
    expect(freshVerifiedEmail("github", undefined)).toBeNull();
  });
});

/**
 * 표시용 마스킹 (malmoi#3). 초대 화면이 갖고 있던 지역 함수를 `lib/auth/email.ts`로 옮겼다 —
 * 번역 셀 메타가 두 번째 소비자가 되면서 구현이 둘로 갈리면 같은 주소가 화면마다 다르게 보인다.
 */
describe("maskEmail — 남의 주소를 그대로 보이지 않는다", () => {
  it("첫 글자와 도메인만 남긴다", () => {
    expect(maskEmail("sinhyeok@day1company.co.kr")).toBe("s***@day1company.co.kr");
  });

  it("`@`가 없거나 맨 앞이면 통째로 가린다 — 자를 지점을 못 믿는다", () => {
    expect(maskEmail("nope")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
  });
});
