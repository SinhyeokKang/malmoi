import { describe, expect, it, vi } from "vitest";

import { githubApi, githubUserinfo } from "../profile";

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

/**
 * **HTTP 실패는 장애다, 거부가 아니다.** `/user`는 `githubUserinfo`가 던지는데 `/user/emails`는 `null`로
 * 접혀 "이메일이 검증되지 않았을 수 있어요"가 됐다 — GitHub 부분 장애 중 **처음 로그인하는 사람만** 막히고
 * 기존 사용자는 재현이 안 된다 (code-review 2026-09-06 🔴5). 두 조회가 같은 함수를 지나 같은 방식으로 던진다.
 */
describe("githubApi — 조회 실패는 던진다", () => {
  const ok = (body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  const status = (code: number) =>
    (async () => new Response("nope", { status: code })) as unknown as typeof fetch;

  it("200이면 본문 JSON을 돌려준다", async () => {
    await expect(githubApi("/user", "tok", ok({ id: 1 }))).resolves.toEqual({ id: 1 });
  });

  it("403·500은 우리 문구(AppError)로 던진다 — Configuration 화면으로 가서 '잠시 뒤 다시'가 뜬다", async () => {
    await expect(githubApi("/user/emails", "tok", status(403))).rejects.toMatchObject({ name: "AppError" });
    await expect(githubApi("/user/emails", "tok", status(500))).rejects.toMatchObject({ name: "AppError" });
  });

  it("던지는 메시지에 토큰이 없다", async () => {
    await expect(githubApi("/user", "secret-token", status(500))).rejects.not.toMatchObject({
      message: expect.stringContaining("secret-token"),
    });
  });

  it("access_token이 비어 있으면 조회하지 않고 던진다 — 설정 문제라 거부가 아니다", async () => {
    const spy = vi.fn();
    await expect(githubApi("/user", "", spy as unknown as typeof fetch)).rejects.toMatchObject({ name: "AppError" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("Bearer 헤더와 GitHub Accept를 보낸다", async () => {
    let seen: RequestInit | undefined;
    const spy = (async (_: unknown, init?: RequestInit) => {
      seen = init;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await githubApi("/user", "tok", spy);
    expect(seen?.headers).toMatchObject({ Authorization: "Bearer tok", Accept: "application/vnd.github+json" });
  });
});
