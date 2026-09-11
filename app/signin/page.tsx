import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { AuthLayout } from "@/components/signin/auth-layout";
import { AuthToast } from "@/components/signin/auth-toast";
import { GithubIcon, GoogleIcon } from "@/components/signin/brand-icons";
import { ProviderSubmit } from "@/components/signin/provider-button";
import { signInErrorMessage } from "@/lib/auth/message";
import { readSession } from "@/lib/auth/read-session";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { clearRevocationCookies } from "@/lib/session-revocation/clear-cookies";
import logo from "@/public/brand/malmoi-icon-black.svg";

/**
 * 로그인 진입점. 미들웨어가 세션 없는 보호 라우트 요청을 여기로 보낸다.
 *
 * ⚠️ **`/`가 아니라 `/signin`이다** (8-1a). 랜딩 페이지가 `/`에 들어올 예정이라 미리 갈랐고,
 * `/`는 `landingTarget`으로 여기 또는 `/projects`로 보내는 껍데기다. **목적지를 만드는 자리는
 * `lib/routes.ts`의 `signIn()` 하나이고**, 나중에 옮기면 아홉 자리가 동시에 움직인다
 * (POSTMORTEM 2026-09-05 — 경로 문자열은 타입이 못 본다).
 *
 * ⚠️ **matcher에 넣지 않는다.** `shouldRedirectToLogin`도 `middleware()`도 경로를 보지 않으므로,
 * 여기가 matcher에 걸리면 쿠키 없는 모든 요청이 **자기 자신으로 307을 돈다.**
 *
 * 이미 로그인돼 있으면 바로 `/projects`로 — 로그인 화면을 두 번 보여줄 이유가 없다.
 *
 * ⚠️ **거부 사유를 여기서 보인다.** `signIn` 콜백이 false를 내면 Auth.js가 `pages.error`로 보내고,
 * 그것을 이 화면으로 돌려놨다 — 기본 `/api/auth/error`는 우리 디자인 밖의 무스타일 페이지다.
 * **피드백은 토스트 하나다**(규약 8) — 인라인 `Alert`를 병행하지 않는다.
 *
 * 형은 2열이다 (8-1b 시안): 폼 좌 · 키비주얼 우.
 */
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sessions?: string }>;
}) {
  const { error, sessions } = await searchParams;
  const session = await readSession();
  if (session.status === "ok") redirect(routes.projects());
  // 세션을 못 읽었으면 `?error=`가 없어도 장애 문구를 보인다 — 로그인 버튼만 보이면 사용자가 헛로그인한다.
  const shown = error ?? (session.status === "unavailable" ? "Unavailable" : undefined);

  return (
    <AuthLayout>
      <div className="flex w-[320px] flex-col items-center gap-4">
        <Image src={logo} alt="" width={48} height={48} priority />
        <h1 className="text-2xl font-medium">{m.signIn.title}</h1>

        <div className="flex w-full flex-col gap-2">
          {/* ⚠️ **primary는 화면당 하나다** (DESIGN §2) — 시안이 GitHub을 채움으로 그렸다. */}
          <ProviderButton provider="github" label={m.signIn.github} variant="primary" />
          <ProviderButton provider="google" label={m.signIn.google} variant="default" />

          <p className="text-muted-foreground text-center text-xs leading-relaxed">
            {m.signIn.consent.before}
            <Link
              href={routes.privacy()}
              className="focus-visible:ring-ring text-blue-600 focus-visible:ring-2 focus-visible:outline-none"
            >
              {m.signIn.consent.link}
            </Link>
          </p>
        </div>
      </div>

      {/* 렌더하지 않는다 — `?error=`·`?sessions=`를 토스트로 옮기는 조각이다. */}
      <AuthToast error={shown === undefined ? undefined : signInErrorMessage(shown)} sessions={sessions} />
    </AuthLayout>
  );
}

/**
 * ⚠️ **함수 이름을 바꾸지 않는다.** `lib/session-revocation/__tests__/normal-login.test.tsx`가
 * `child.type.name === "ProviderButton"`으로 이것을 찾고, 그 테스트는 **POSTMORTEM 2026-09-10의
 * 유일한 방어선**이다 — `clearRevocationCookies()`가 `signIn()`보다 먼저 불리는 것을 고정한다.
 * `redirectTo: "/projects"`도 같은 이유로 그대로다.
 */
function ProviderButton({
  provider,
  label,
  variant,
}: {
  provider: string;
  label: string;
  variant: "primary" | "default";
}) {
  return (
    <form
      action={async () => {
        "use server";
        await clearRevocationCookies();
        await signIn(provider, { redirectTo: "/projects" });
      }}
    >
      {/* ⚠️ 높이는 `size="lg"`가 든다 (DESIGN §8) — 호출부는 폭·여백만 덧댄다. */}
      <ProviderSubmit
        label={label}
        variant={variant}
        icon={provider === "github" ? <GithubIcon className="size-4" /> : <GoogleIcon className="size-4" />}
      />
    </form>
  );
}
