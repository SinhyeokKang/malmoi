import type { DefaultSession } from "next-auth";

/**
 * `session.user.id`에 `User.id`를 싣는다 (`auth.ts`의 session 콜백).
 *
 * ⚠️ **`login`(GitHub 핸들)이 사라진 자리다.** JWT 세션에서는 jwt 콜백이 핸들을 토큰에 실어
 * 날랐지만, DB 세션에서는 session 콜백에 `token`이 오지 않고 `user`가 온다 — 실을 곳이 없다.
 * 그리고 실을 이유도 없다: Google로 로그인한 사용자에게는 핸들이 없고, SAAS §3이
 * **"로그인 방식이 역할을 정하지 않는다"** 고 못박았다.
 */
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
