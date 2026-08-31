import type { DefaultSession } from "next-auth";

/**
 * `session.user.login`에 GitHub 핸들을 싣는다. `Translation.updatedBy`가 이 값을 쓰고,
 * JWT 세션이라 사용자 테이블이 없어 문자열로 박는다 (auth.ts).
 */
declare module "next-auth" {
  interface Session {
    user: { login?: string } & DefaultSession["user"];
  }
}
