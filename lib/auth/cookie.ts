/**
 * 미들웨어의 **1차 차단** 판정 (ARCHITECTURE §6.1).
 *
 * ⚠️ **`auth()` 래퍼를 쓰지 않는 이유.** DB 세션(`strategy: "database"`)에서 그 래퍼는
 * `adapter.getSessionAndUser`를 부르고 `updateAge`를 넘으면 세션 갱신 **쓰기**까지 한다
 * (`next-auth/lib/index.js`, `@auth/core/lib/actions/session.js`). 미들웨어가 Prisma·pg를 물게
 * 되어 "값싼 1차 차단"이 거짓이 된다.
 *
 * ⚠️ **이건 차단이 아니라 값싼 거름이다.** 쿠키가 위조·만료됐는지 모르고 프로젝트 인가는 전혀
 * 모른다 — 진짜 판정은 `planProjectAccess`가 진입점에서 한다 (ARCHITECTURE §6.00 ①).
 */

/**
 * Auth.js는 https에서 `__Secure-` 접두를 붙인다(`@auth/core/lib/utils/cookie.js`). 로컬은 http라
 * 접두가 없다 — **둘 다 보지 않으면 한쪽 환경에서 로그인이 통째로 깨진다.**
 *
 * 이름을 정확히 대조한다. DB 세션의 토큰은 짧아 Auth.js의 쿠키 청크 분할(`.0`·`.1`)이 생기지 않는다.
 */
const SESSION_COOKIES: ReadonlySet<string> = new Set([
  "authjs.session-token",
  "__Secure-authjs.session-token",
]);

export function hasSessionCookie(names: readonly string[]): boolean {
  return names.some((name) => SESSION_COOKIES.has(name));
}

/**
 * 미들웨어가 `/`로 돌려보낼 요청인가 — **렌더 요청(GET·HEAD)에 세션 쿠키가 없을 때만**이다.
 *
 * ⚠️ **Server Action POST는 돌려보내지 않는다.** Action은 현재 페이지 URL로 POST되어 같은 matcher에
 * 걸리는데, 쿠키가 없을 때 307을 내면 `fetch`가 POST를 `/`로 재전송하고 거기엔 그 action id가 없어
 * 클라이언트가 던진다 — 한국어 거부 문구 대신 **페이지 오류**가 뜨고 입력이 사라진다 (Codex 감사
 * 2026-09-06 #6). Action은 스스로 `auth()`로 `unauthorized`를 내므로 여기서 막아 얻는 것이 없다.
 * 세션이 `maxAge`를 넘으면 브라우저가 쿠키를 지우므로 "쿠키 없는 POST"는 가정이 아니라 매일 일어난다.
 */
export function shouldRedirectToLogin(input: { method: string; cookieNames: readonly string[] }): boolean {
  const method = input.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  return !hasSessionCookie(input.cookieNames);
}
