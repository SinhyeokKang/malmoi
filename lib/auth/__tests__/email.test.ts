import { describe, expect, it } from "vitest";

import { normalizeEmail } from "../email";

/**
 * 이메일 정규화 — **trim + 소문자, 그 이상은 하지 않는다** (design §2).
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
