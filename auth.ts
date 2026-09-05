import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { verifiedEmailFrom } from "@/lib/auth/email";
import { githubUserinfo } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/db";

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
 * 조회 실패는 `null`이고 그러면 검증이 실패해 로그인이 거부된다 — **fail-closed 쪽으로 접는다.**
 * 다만 원인이 사라지지 않게 로그에 남긴다: 일시적 장애와 미검증 계정이 사용자에게는 같은 거부로 보인다.
 */
async function githubApi(path: string, token: string): Promise<unknown> {
  if (token === "") {
    console.warn("[auth] github: access_token이 없어 이메일 검증을 할 수 없다");
    return null;
  }
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "malmoi",
    },
  });
  if (!response.ok) {
    console.warn(`[auth] github: ${path} 조회 실패 (${response.status})`);
    return null;
  }
  return await response.json();
}

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
 * 같은 User가 있고 그 provider의 Account가 없으면 `OAuthAccountNotLinked`를 던진다 — 그게 이
 * 단계의 계정 병합 방어선 전부다. 켜는 순간 **같은 이메일이라는 이유만으로 계정이 합쳐지고**,
 * SAAS §5.5는 그것을 "불편이 아니라 계정 탈취"라 부른다. 명시적 연결은 4단계다.
 * `lib/auth/__tests__/provider-config.test.ts`가 이 부재를 검사한다.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(async () => ({
  adapter: PrismaAdapter(getPrisma()),
  providers: [github, google],
  /**
   * `maxAge`는 JWT 때 값 그대로다. **그 24시간의 근거(권한 회수 지연 상한)는 사라졌지만**
   * — 이제 `ProjectMember` 행이 없어지면 다음 요청에서 막힌다 — 세션 길이 자체를 바꾸는 것은
   * 이 단계가 요청받은 일이 아니다.
   */
  session: { strategy: "database", maxAge: 60 * 60 * 24 },
  // 거부는 우리 로그인 화면에서 보인다 — 기본 `/api/auth/error`는 디자인 밖의 무스타일 페이지다.
  pages: { signIn: "/", error: "/" },
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
    signIn({ user }) {
      // provider 설정이 검증에 실패하면 email을 비워 보낸다 (`githubUserinfo`).
      return typeof user.email === "string" && user.email !== "";
    },

    /**
     * DB 세션에서는 `token`이 오지 않고 **`user`(어댑터가 읽은 행)** 가 온다. 세션에 싣는 것은
     * `id` 하나다 — role·projectIds를 실으면 JWT의 회수 지연이 그대로 돌아온다 (SAAS §5.3).
     */
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
}));
