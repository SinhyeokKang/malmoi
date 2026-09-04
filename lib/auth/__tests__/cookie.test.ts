import { describe, expect, it } from "vitest";

import { hasSessionCookie } from "../cookie";

/**
 * 미들웨어의 **1차 차단** 판정 (design §4).
 *
 * ⚠️ DB 세션으로 바뀌면 `auth()` 래퍼가 `adapter.getSessionAndUser`를 부르고 `updateAge`를 넘으면
 * 쓰기까지 한다 — 미들웨어가 Prisma를 물게 된다. 그래서 래퍼를 버리고 **쿠키 이름만** 본다.
 *
 * 이름이 둘인 이유: Auth.js는 https에서 `__Secure-` 접두를 붙인다. 로컬(http)은 접두가 없다 —
 * **둘 다 보지 않으면 한쪽 환경에서 로그인이 통째로 깨진다.**
 *
 * 이 판정은 **차단이 아니라 값싼 1차 거름**이다. 쿠키가 위조·만료됐는지는 모르고,
 * 프로젝트 인가는 전혀 모른다 — 진짜 판정은 `planProjectAccess`가 한다.
 */

describe("hasSessionCookie — 두 이름을 모두 본다", () => {
  it("http(로컬)의 authjs.session-token을 인식한다", () => {
    expect(hasSessionCookie(["authjs.session-token"])).toBe(true);
  });

  it("https(preview·프로덕션)의 __Secure-authjs.session-token을 인식한다", () => {
    expect(hasSessionCookie(["__Secure-authjs.session-token"])).toBe(true);
  });

  it("다른 쿠키에 섞여 있어도 찾는다", () => {
    expect(hasSessionCookie(["_vercel_jwt", "authjs.csrf-token", "authjs.session-token"])).toBe(true);
  });

  it("쿠키가 없으면 false다", () => {
    expect(hasSessionCookie([])).toBe(false);
  });

  it("세션 쿠키가 아닌 것만 있으면 false다 — csrf·callback-url은 로그인 증거가 아니다", () => {
    expect(hasSessionCookie(["authjs.csrf-token", "authjs.callback-url"])).toBe(false);
  });

  it("이름이 비슷한 쿠키를 통과시키지 않는다 — DB 세션 토큰은 짧아 청크가 생기지 않는다", () => {
    expect(hasSessionCookie(["authjs.session-token.0"])).toBe(false);
    expect(hasSessionCookie(["x-authjs.session-token"])).toBe(false);
    expect(hasSessionCookie(["authjs.session-tokens"])).toBe(false);
  });
});
