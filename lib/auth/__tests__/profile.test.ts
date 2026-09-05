import { describe, expect, it } from "vitest";

import { githubUserinfo } from "../profile";

/**
 * GitHub 두 응답(`/user` + `/user/emails`)을 provider가 쓸 profile 하나로 합친다.
 *
 * ⚠️ **두 실패를 구별한다.**
 * - `/user` 조회 실패 = **시스템 오류**다. 그대로 두면 provider 기본 `profile()`이
 *   `profile.id.toString()`에서 `undefined.toString()`으로 던져 사용자가 원인과 무관한
 *   `Configuration` 오류 화면을 본다. 여기서 **우리 문구로** 던진다.
 * - 이메일 검증 실패 = **정상적인 거부**다. `email`을 비워 보내고 `signIn`이 거부한다 —
 *   던지지 않는다.
 *
 * 둘을 접으면 "GitHub이 잠깐 죽었다"와 "이 계정은 검증된 이메일이 없다"가 같은 화면이 된다
 * (POSTMORTEM 2026-09-03 — 실패와 "해당 없음"을 다른 경로로 보낸다).
 */

const verified = [{ email: "a@b.com", primary: true, verified: true }];

describe("githubUserinfo — 정상", () => {
  it("/user 응답에 검증된 이메일을 얹는다", () => {
    expect(githubUserinfo({ user: { id: 1, login: "octo" }, addresses: verified })).toEqual({
      id: 1,
      login: "octo",
      email: "a@b.com",
    });
  });

  it("provider가 준 email을 검증된 값으로 덮는다 — 공개 이메일이 primary가 아닐 수 있다", () => {
    expect(
      githubUserinfo({ user: { id: 1, email: "public@x.com" }, addresses: verified }),
    ).toEqual({ id: 1, email: "a@b.com" });
  });

  it("id가 문자열이어도 그대로 보존한다", () => {
    expect(githubUserinfo({ user: { id: "1" }, addresses: verified })).toMatchObject({ id: "1" });
  });
});

describe("githubUserinfo — 이메일 검증 실패는 거부 경로다", () => {
  it("검증된 주소가 없으면 email을 비우고 던지지 않는다", () => {
    const result = githubUserinfo({ user: { id: 1 }, addresses: [] });
    expect(result).toEqual({ id: 1, email: "" });
  });

  it("addresses 조회가 실패해도(null) 던지지 않는다 — signIn이 거부한다", () => {
    expect(githubUserinfo({ user: { id: 1 }, addresses: null })).toEqual({ id: 1, email: "" });
  });
});

describe("githubUserinfo — /user 조회 실패는 시스템 오류다", () => {
  it("응답이 null이면 던진다", () => {
    expect(() => githubUserinfo({ user: null, addresses: verified })).toThrow();
  });

  it("응답이 객체가 아니면 던진다", () => {
    expect(() => githubUserinfo({ user: "boom", addresses: verified })).toThrow();
    expect(() => githubUserinfo({ user: 42, addresses: verified })).toThrow();
  });

  it("id가 없으면 던진다 — 그대로 두면 provider가 undefined.toString()에서 죽는다", () => {
    expect(() => githubUserinfo({ user: {}, addresses: verified })).toThrow();
    expect(() => githubUserinfo({ user: { login: "octo" }, addresses: verified })).toThrow();
    expect(() => githubUserinfo({ user: { id: null }, addresses: verified })).toThrow();
  });

  it("던지는 메시지가 GitHub 조회를 가리킨다 — 이메일 미검증과 헷갈리지 않게", () => {
    expect(() => githubUserinfo({ user: null, addresses: verified })).toThrow(/github/i);
  });
});
