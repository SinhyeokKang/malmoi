import { describe, expect, it } from "vitest";

import { authErrorLabel, isSessionReadError, noteAuthError, withOutageFlag } from "../outage";

/**
 * **"세션 없음"과 "세션을 못 읽었다"를 가른다** (POSTMORTEM 2026-09-06 — 리다이렉트 100%를 정상으로 읽었다).
 *
 * `auth()`는 어댑터 예외를 `logger.error(new SessionTokenError(e))`로 삼키고 `null`을 돌려준다
 * (`@auth/core/lib/actions/session.js:123`). 반환값으로는 원리적으로 구별할 수 없으므로 **logger를 통해**
 * 요청 스코프에 표시를 남긴다. `AsyncLocalStorage`라 동시 요청이 서로의 표시를 보지 않는다.
 */

// 프로덕션 빌드는 클래스명을 줄여 `error.name`이 `k`가 됐다(B7 실습 — `[auth] k`). Auth.js는 `type`을 정적 문자열로 둔다.
describe("authErrorLabel — 로그에 남길 고정 분류", () => {
  it("Auth.js 오류는 최소화된 클래스명이 아니라 type이다", () => {
    class k extends Error { type = "OAuthCallbackError"; }
    expect(authErrorLabel(new k("code=secret"))).toBe("OAuthCallbackError");
  });

  it("type이 없거나 식별자 모양이 아니면 기존 값(name)이다 — 오류 문장을 싣지 않는다", () => {
    expect(authErrorLabel(new TypeError("x"))).toBe("TypeError");
    expect(authErrorLabel(Object.assign(new Error("x"), { type: "has space=secret" }))).toBe("Error");
    expect(authErrorLabel(Object.assign(new Error("x"), { type: 42 }))).toBe("Error");
  });

  it("Error가 아니면 typeof다", () => {
    expect(authErrorLabel("boom")).toBe("string");
    expect(authErrorLabel({ type: "SessionTokenError" })).toBe("object");
  });
});

describe("isSessionReadError — Auth.js 오류의 type으로 판정한다", () => {
  it("SessionTokenError는 세션 읽기 실패다", () => {
    expect(isSessionReadError({ type: "SessionTokenError", message: "x" })).toBe(true);
  });

  it("다른 AuthError(예: OAuthAccountNotLinked)는 아니다 — 그건 정당한 거부다", () => {
    expect(isSessionReadError({ type: "OAuthAccountNotLinked", message: "x" })).toBe(false);
  });

  it("type이 없는 일반 Error·비객체는 아니다", () => {
    expect(isSessionReadError(new Error("boom"))).toBe(false);
    expect(isSessionReadError(null)).toBe(false);
    expect(isSessionReadError("SessionTokenError")).toBe(false);
  });
});

describe("withOutageFlag — 요청 스코프 표시", () => {
  it("안에서 세션 읽기 오류가 기록되면 outage가 true다", async () => {
    const result = await withOutageFlag(async () => {
      noteAuthError({ type: "SessionTokenError" });
      return null;
    });
    expect(result).toEqual({ value: null, outage: true });
  });

  it("기록이 없으면 false이고 값은 그대로 나온다", async () => {
    const result = await withOutageFlag(async () => ({ user: { id: "u1" } }));
    expect(result).toEqual({ value: { user: { id: "u1" } }, outage: false });
  });

  it("다른 종류의 오류는 표시를 세우지 않는다", async () => {
    const result = await withOutageFlag(async () => {
      noteAuthError({ type: "OAuthAccountNotLinked" });
      return null;
    });
    expect(result.outage).toBe(false);
  });

  it("동시 요청이 서로의 표시를 보지 않는다", async () => {
    const [a, b] = await Promise.all([
      withOutageFlag(async () => {
        await new Promise((r) => setTimeout(r, 5));
        noteAuthError({ type: "SessionTokenError" });
        return "a";
      }),
      withOutageFlag(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "b";
      }),
    ]);
    expect(a).toEqual({ value: "a", outage: true });
    expect(b).toEqual({ value: "b", outage: false });
  });

  it("스코프 밖의 기록은 무시된다 — 던지지 않는다", () => {
    expect(() => noteAuthError({ type: "SessionTokenError" })).not.toThrow();
  });
});
