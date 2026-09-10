import { credentialAdapter } from "@/lib/credentials/adapter";
import { refreshVerifiedEmail } from "@/lib/credentials/access";
import { randomBytes } from "node:crypto";
import NextAuth from "next-auth";
import { authorizeRevocation, withRevocation, revocationAuthCookies } from "@/lib/session-revocation/http";
import type { NextRequest } from "next/server";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { freshVerifiedEmail, verifiedEmailFrom } from "@/lib/auth/email";
import { noteAuthError } from "@/lib/auth/outage";
import { githubApi, githubUserinfo } from "@/lib/auth/profile";
import { publicSession } from "@/lib/auth/public-session";
import { getPrisma } from "@/lib/db";
import { routes } from "@/lib/routes";

/**
 * ⚠️ **검증을 `profile`을 만드는 자리에서 한다.** 여기서 거른 값이 그대로 `User.email`이 되기
 * 때문이다 — `signIn` 콜백에서 검사만 하고 통과시키면 **검증한 주소와 저장되는 주소가 갈린다.**
 * (`signIn`이 받는 `user`는 기존 사용자일 때 DB 행이고, 어댑터에 넘어가는 것은 `userFromProvider`다.
 * 콜백에서 객체를 고치는 방식은 첫 로그인에만 듣고 라이브러리 내부 흐름에 묶인다.)
 *
 * 판정은 전부 `verifiedEmailFrom`이 한다 — 여기는 재료를 모아 넘기고 결과를 `email`에 넣는다.
 * 검증 실패는 빈 문자열이고, `signIn`이 그때 거부한다.
 */
const github = GitHub({
  checks: ["pkce", "state"],
  userinfo: {
    url: "https://api.github.com/user",
    async request({ tokens }: { tokens: { access_token?: unknown } }) {
      const token = typeof tokens.access_token === "string" ? tokens.access_token : "";
      const [user, addresses] = await Promise.all([
        githubApi("/user", token),
        // ⚠️ **provider 기본 동작을 대체하는 이유**: 그쪽은 공개 이메일이 없을 때만 이걸 조회하고,
        // 조회해도 `emails.find(e => e.primary) ?? emails[0]`로 **주소만 뽑고 `verified`를 버린다**
        // (2026-09-05 실측). 공개 이메일이 있으면 그 값이 primary가 아닐 수도 있다.
        githubApi("/user/emails", token),
      ]);
      return githubUserinfo({ user, addresses });
    },
  },
});

const google = Google({
  checks: ["pkce", "state"],
  profile(profile) {
    return {
      id: String(profile.sub),
      name: profile.name,
      image: profile.picture,
      email:
        verifiedEmailFrom({
          provider: "google",
          email: profile.email,
          emailVerified: profile.email_verified,
        }) ?? "",
    };
  },
});

/**
 * Auth.js v5. **로그인·인가 전용이다** — 리포 쓰기는 GitHub App installation 토큰이 맡는다.
 * OAuth 토큰으로 커밋하면 커밋이 특정 개인 명의가 되고 그 사람이 떠나면 파이프라인이
 * 깨진다 (ARCHITECTURE §6).
 *
 * **DB 세션이다** (SaaS 2단계, SAAS §5.3). JWT의 대가였던 "권한 회수가 최대 24시간 지연"을
 * 없앤다 — 세션에 담는 것은 `userId`뿐이고 권한은 매 요청 `ProjectMember`에서 읽는다. 토큰에
 * role이나 projectIds를 실으면 JWT의 지연 문제가 그대로 돌아온다.
 *
 * ⚠️ **config가 함수다.** `PrismaAdapter(getPrisma())`를 인자 자리에 그대로 두면
 * `requireEnv("DATABASE_URL")`이 **import 시점에** 던져 `.env` 없는 빌드가 통째로 죽는다 —
 * `prisma.config.ts`가 같은 모양으로 CI와 Vercel을 두 번 red로 만들었다
 * (POSTMORTEM 2026-08-31 + 🔁 재발 2건).
 *
 * ⚠️ **`allowDangerousEmailAccountLinking`을 어느 provider에도 켜지 않는다.** 어댑터는 이메일이
 * 같은 User가 있고 그 provider의 Account가 없으면 `OAuthAccountNotLinked`를 던진다 — 이메일 기반 자동 병합을 막는다.
 * 로그인 세션의 추가 계정 연결은 safePrismaAdapter가 별도로 거부한다. 켜는 순간 **같은 이메일이라는 이유만으로 계정이 합쳐지고**,
 * SAAS §5.5는 그것을 "불편이 아니라 계정 탈취"라 부른다. 명시적 연결은 4단계다.
 * `lib/auth/__tests__/provider-config.test.ts`가 이 부재를 검사한다.
 */
const authConfig = NextAuth(async () => ({
  adapter: credentialAdapter(getPrisma()),
  cookies: revocationAuthCookies(),
  providers: [github, google],
  /**
   * `maxAge` 24시간은 이제 **"마지막 활동 뒤 24시간"** 이다 (2026-09-06 결정). 전에는 `updateAge`를
   * 안 줘서 Auth.js 기본값(24h)이 `maxAge`와 같았고, 그러면 `session.js:81-87`의 갱신 시점이 `expires`와
   * 일치해 **세션이 한 번도 연장되지 않았다** — 로그인 정각 24시간 뒤 편집 도중 끊기고, 브라우저가 쿠키를
   * 지워 blur 저장이 미들웨어에 걸렸다 (Codex 감사 2026-09-06 #6). `updateAge` 1시간이면 활동 중인 세션은
   * 한 시간에 한 번만 DB 쓰기로 연장된다.
   */
  session: { strategy: "database", generateSessionToken: () => randomBytes(32).toString("base64url"), maxAge: 60 * 60 * 24, updateAge: 60 * 60 },
  /**
   * 거부는 우리 로그인 화면에서 보인다 — 기본 `/api/auth/error`는 디자인 밖의 무스타일 페이지다.
   *
   * ⚠️ **둘이 서로 다른 갈래를 받는다.** `@auth/core`가 `AuthError.kind`로 가른다 —
   * `OAuthAccountNotLinked`는 `signIn`으로, `AccessDenied`(아래 `return false`)·`Configuration`은
   * `error`로 간다. 같은 값을 넣어 두면 그 분기가 보이지 않으므로, 검증할 때 **두 갈래를 각각**
   * 밟아야 한다.
   */
  pages: { signIn: routes.signIn(), error: routes.signIn() },
  /**
   * ⚠️ **세션 읽기 실패를 밖으로 알리는 유일한 통로다.** `auth()`는 어댑터 예외를 여기로 보내고 `null`을
   * 돌려주므로(`session.js:123`) 반환값으로는 비로그인과 구별할 수 없다 — 프로덕션 전면 장애를
   * "정상"으로 읽었다 (POSTMORTEM 2026-09-06). `noteAuthError`가 요청 스코프에 표시를 남기고
   * `readSession`이 그것을 `unavailable`로 돌려준다. `warn`·`debug`는 기본 logger가 그대로 맡는다.
   */
  logger: {
    error(error) {
      // ⚠️ **오류 객체를 통째로 찍지 않는다** (2026-09-09, sec-audit 발견 24). `console.error(error)`는
      // `cause` 사슬까지 펼쳐, 아래 계층(Prisma·어댑터)이 인자를 품은 경우 그것이 Vercel 로그에
      // 남는다. `lib/github-connect/log.ts`처럼 메시지·cause 없이 고정 분류만 기록한다.
      //
      // ⚠️ **`noteAuthError`는 좁히지 않는다** — 그 판정은 `error.type`을 보므로 **출력만** 줄인다
      // (POSTMORTEM 2026-09-06: 이 통로가 장애를 밖으로 알리는 유일한 자리다).
      const type = error instanceof Error ? error.name : typeof error;
      console.error("[auth]", type);
      noteAuthError(error);
    },
  },
  callbacks: {
    /**
     * 인가 지점. **`handleLoginOrRegister`보다 먼저 돈다**(`@auth/core`의 callback 라우트) —
     * 여기서 false를 내면 `User`·`Account` 행이 만들어지지 않으므로 거부된 시도가 고아 행을
     * 남기지 않는다.
     *
     * **검사는 이메일 하나다.** 판정 자체는 위 provider 설정이 했고 여기서는 그 결과가 비어
     * 있는지만 본다.
     *
     * ⚠️ **허용 핸들 목록(`AUTH_ALLOWED_LOGINS`)이 2026-09-05에 사라졌다.** 인가는 이제
     * `ProjectMember`가 한다 (SAAS §9 불변식 7) — **로그인은 신원 확인이고, 무엇을 할 수 있는지는
     * 각 진입점의 `getProjectAccess`가 정한다.** 목록을 남긴 채 멤버십을 붙이면 두 인가가 AND로
     * 걸려 좁은 쪽이 이기고, 초대받은 비개발자가 핸들이 없어 **로그인 단계에서** 막힌다.
     * 그래서 전환과 제거가 같은 커밋이었다.
     *
     * ⚠️ **로그인이 열렸다고 아무것도 열리지 않는다.** 멤버십이 없는 사용자는 `/projects`에서
     * "어느 프로젝트의 멤버도 아니다"를 보고, 어떤 slug를 직접 쳐도 `not-found`로 돌아간다.
     *
     * ⚠️ **매 로그인 재검증이 아니다**: `@auth/core`는 `handleAuthorized`에
     * `userByAccount ?? userFromProvider`를 넘기므로 **기존 사용자면 여기 오는 `user`가 DB 행**이고,
     * 그 `email`은 예전에 검증돼 저장된 값이라 항상 비어 있지 않다. 이 검사가 실제로 막는 것은
     * **처음 들어오는 계정**이다. OAuth 경로는 `updateUser`를 부르지 않으므로(`handle-login.js`)
     * 저장된 값이 오염되지는 않는다.
     */
    async signIn({ user, account, profile }) {
      const revocation = await authorizeRevocation(getPrisma(), account);
      if (revocation !== null) return revocation;
      // provider 설정이 검증에 실패하면 email을 비워 보낸다 (`githubUserinfo`).
      if (typeof user.email !== "string" || user.email === "") return false;

      /**
       * ⚠️ **기존 사용자의 `User.email`을 지금 검증된 주소로 맞춘다.** OAuth 재로그인은 `updateUser`를 부르지
       * 않아 저장값이 첫 로그인 때로 굳는다 — primary를 바꾼 사람은 새 주소로 온 초대를 영영 수락하지 못한다
       * (Codex 감사 2026-09-06 #5). "기존 사용자"는 `Account` 행으로 판정한다 — `user.id`는 새 사용자일 때
       * provider의 id라 믿을 수 없다. 새 주소를 다른 User가 쓰면 **건너뛴다**(병합 금지, 로그인은 허용).
       */
      const provider = account?.provider;
      const providerAccountId = account?.providerAccountId;
      if (provider === undefined || providerAccountId === undefined) return true;
      try {
        await refreshVerifiedEmail(getPrisma(), provider, providerAccountId, freshVerifiedEmail(provider, profile));
      } catch {
        // 장애는 사유를 실어 보낸다 — 그냥 로그인 화면이면 정당한 비로그인과 같은 응답이 된다.
        return routes.signIn({ error: "Unavailable" });
      }
      return true;
    },

    /**
     * DB 세션에서는 `token`이 오지 않고 **`user`(어댑터가 읽은 행)** 가 온다. 세션에 싣는 것은
     * `id` 하나다 — role·projectIds를 실으면 JWT의 회수 지연이 그대로 돌아온다 (SAAS §5.3).
     *
     * ⚠️ **입력 `session`을 돌려주지 않는다.** 그 객체는 `Session` **행**이라 `sessionToken`이 들어
     * 있고, 반환값이 곧 `/api/auth/session` 본문이다 — 그대로 돌려주면 HttpOnly 쿠키의 값이 JSON으로
     * 샌다 (Codex 감사 2026-09-06 #1). `publicSession`이 허용 목록으로 새 객체를 만든다.
     */
    session({ session, user }) {
      return publicSession({ session, user });
    },
  },
}));

export const { auth, signIn, signOut } = authConfig;
export const handlers = {
  GET: (request: NextRequest) => withRevocation(request, () => authConfig.handlers.GET(request)),
  POST: (request: NextRequest) => withRevocation(request, () => authConfig.handlers.POST(request)),
};
