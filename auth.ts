import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

import { isLoginAllowed, parseAllowedLogins } from "@/lib/auth/allow";

/**
 * Auth.js v5. **로그인·인가 전용이다** — 리포 쓰기는 GitHub App installation 토큰이 맡는다.
 * OAuth 토큰으로 커밋하면 커밋이 특정 개인 명의가 되고 그 사람이 떠나면 파이프라인이
 * 깨진다 (ARCHITECTURE §6).
 *
 * **JWT 세션이다** (DB 어댑터 없음). 스키마가 5테이블로 유지되고 요청마다의 DB 왕복이 없다.
 * 대가는 **권한 회수가 최대 24시간 지연**되는 것이다 — 허용 목록에서 핸들을 빼도 이미 발급된
 * 토큰은 만료까지 살아 있다. 즉시 회수가 필요해지면 `@auth/prisma-adapter`로 DB 세션으로
 * 바꾼다. `maxAge`를 줄이는 것으로 때우지 않는다 (MVP §5).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  callbacks: {
    /**
     * 인가 지점. **여기서 막지 않으면 GitHub 계정만 있으면 누구나 들어온다.**
     * 허용 목록이 비면 아무도 통과하지 못한다(fail-closed).
     */
    signIn({ profile }) {
      // GitHub raw profile의 `login`이 핸들이다 — 실측으로 `profile`에 정상 전달됨을 확인했다.
      const login = typeof profile?.["login"] === "string" ? profile["login"] : null;
      return isLoginAllowed(login, parseAllowedLogins(process.env["AUTH_ALLOWED_LOGINS"]));
    },

    /**
     * GitHub 핸들을 토큰에 실어 나른다. `Translation.updatedBy`가 이 값을 쓴다 —
     * 사용자 테이블이 없어 문자열로 박는다.
     */
    jwt({ token, profile }) {
      if (typeof profile?.["login"] === "string") token["login"] = profile["login"];
      return token;
    },

    session({ session, token }) {
      const login = token["login"];
      if (typeof login === "string") session.user.login = login;
      return session;
    },
  },
});
