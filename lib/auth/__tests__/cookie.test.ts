import { describe, expect, it } from "vitest";

import { hasSessionCookie, sessionCookieName, shouldRedirectToLogin } from "../cookie";

/**
 * 미들웨어의 **1차 차단** 판정 (ARCHITECTURE §6.1).
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

/**
 * **Server Action POST는 미들웨어가 돌려보내지 않는다.**
 *
 * Action은 현재 페이지 URL로 POST되므로 `/projects/:path*`에 걸린다. 쿠키가 없을 때 307을 내면 `fetch`가
 * POST를 `/`로 재전송하고, 거기엔 그 action id가 없어 클라이언트가 던진다 — 한국어 거부 문구가 아니라
 * **페이지 오류**가 되고 입력이 사라진다 (Codex 감사 2026-09-06 #6). Action은 스스로 `auth()`를 지나므로
 * 이 검사가 보태는 방어가 없다. 세션은 `maxAge`가 다 되면 쿠키째 사라지므로 이 경로는 가정이 아니다.
 */
describe("shouldRedirectToLogin — 렌더(GET)만 돌려보낸다", () => {
  it("GET + 쿠키 없음 → 로그인으로", () => {
    expect(shouldRedirectToLogin({ method: "GET", cookieNames: [] })).toBe(true);
  });

  it("GET + 세션 쿠키 → 통과", () => {
    expect(shouldRedirectToLogin({ method: "GET", cookieNames: ["authjs.session-token"] })).toBe(false);
  });

  it("POST + 쿠키 없음 → 통과 — Action이 자기 인증으로 unauthorized를 낸다", () => {
    expect(shouldRedirectToLogin({ method: "POST", cookieNames: [] })).toBe(false);
  });

  it("HEAD는 GET과 같다 — 렌더 요청이다", () => {
    expect(shouldRedirectToLogin({ method: "HEAD", cookieNames: [] })).toBe(true);
  });

  it("메서드 대소문자에 흔들리지 않는다", () => {
    expect(shouldRedirectToLogin({ method: "get", cookieNames: [] })).toBe(true);
    expect(shouldRedirectToLogin({ method: "post", cookieNames: [] })).toBe(false);
  });
});

// Auth.js 규칙(`@auth/core/lib/utils/cookie.js`) — https면 `__Secure-` 접두다. 인증 왕복 셋이 이 함수 하나를 쓴다 (L7.4).
it("sessionCookieName — secure일 때만 __Secure- 접두", () => {
  expect(sessionCookieName(true)).toBe("__Secure-authjs.session-token");
  expect(sessionCookieName(false)).toBe("authjs.session-token");
});
