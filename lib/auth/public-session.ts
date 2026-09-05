/**
 * `session` 콜백의 반환값 — **허용 목록으로 새로 만든다.**
 *
 * ⚠️ DB 세션에서 콜백이 받는 `session`은 공개용 객체가 아니라 **`Session` 행**이다
 * (`@auth/core/lib/actions/session.js:98` — `{ ...세션행, user }`). `sessionToken`·`userId`가 들어 있고,
 * 콜백 반환값이 그대로 `/api/auth/session`의 본문이 된다(104행). 입력에 키를 하나 더 얹어 돌려주는
 * 방식은 그 토큰을 **HttpOnly 쿠키와 같은 값으로 JSON에** 싣는다 — 같은 출처 스크립트에 대한
 * HttpOnly의 의미가 사라진다 (Codex 감사 2026-09-06 #1).
 *
 * Auth.js 기본 콜백(`lib/init.js:20`)이 정확히 이 허용 목록이었고, `id`를 싣기 위해 콜백을 대체하면서
 * 그 목록을 잃었다. 여기서 되살린다 — **입력이 넓어져도 출력은 넓어지지 않는다.**
 */

export type PublicSession = {
  user: { id: string; name: string | null; email: string | null; image: string | null };
  expires: string;
};

export function publicSession(input: {
  session: { expires: Date | string };
  user: { id: string; name?: string | null; email?: string | null; image?: string | null };
}): PublicSession {
  const { session, user } = input;
  const expires = session.expires instanceof Date ? session.expires.toISOString() : session.expires;
  // undefined 대신 null — JSON에서 키가 사라져 클라이언트가 보는 모양이 흔들리지 않게 한다.
  return {
    user: { id: user.id, name: user.name ?? null, email: user.email ?? null, image: user.image ?? null },
    expires,
  };
}
