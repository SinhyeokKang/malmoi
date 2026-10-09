import { Link as InlineLink } from "@/components/ui/link";
import { clearAuthRoundtripCookies } from "@/lib/auth/roundtrip-cookies";
import type { Metadata } from "next";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { AuthColumn, AuthHeading } from "@/components/signin/auth-column";
import { AuthLayout } from "@/components/signin/auth-layout";
import { AuthToast } from "@/components/signin/auth-toast";
import { GithubIcon, GoogleIcon } from "@/components/signin/brand-icons";
import { ProviderSubmit } from "@/components/signin/provider-button";
import { MalmoiMark } from "@/components/ui/malmoi-mark";
import { signInErrorMessage } from "@/lib/auth/message";
import { readSession } from "@/lib/auth/read-session";
import { getMessages } from "@/lib/i18n/server";
import { en } from "@/messages/en";
import { deploymentMode } from "@/lib/deployment/mode";
import { routes } from "@/lib/routes";
import { consentLinkProps } from "@/lib/seo/public-response";
import { destFromCallbackUrl } from "@/lib/login-link/policy";
import { firstQueryValues, type Raw } from "@/lib/search-params";

/** 로그인 폼은 검색 가치가 없다 — 브랜드 검색은 랜딩이 받는다(seo-geo spec D6). robots.txt로는 막지 않는다(`/invite`와 같은 이유). */
export const metadata: Metadata = { title: en.seo.signInTitle, robots: { index: false, follow: false } };

/**
 * 로그인 진입점. 미들웨어가 세션 없는 보호 라우트 요청을 여기로 보낸다.
 *
 * ⚠️ **`/`가 아니라 `/signin`이다** (8-1a). 랜딩이 `/`에 설 자리라 미리 갈랐다.
 * 지금 `/`는 랜딩이고 로그인 상태면 `/projects`로 보낸다(`rootView`). **목적지를 만드는 자리는
 * `lib/routes.ts`의 `signIn()` 하나이고**, 나중에 옮기면 아홉 자리가 동시에 움직인다
 * (POSTMORTEM 2026-09-05 — 경로 문자열은 타입이 못 본다).
 *
 * ⚠️ **보호 경로(`isProtectedPath`)에 넣지 않는다.** `shouldRedirectToLogin`은 목적지를 보지 않으므로,
 * 여기가 보호 경로에 들면 쿠키 없는 모든 요청이 **자기 자신으로 307을 돈다.**
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
  searchParams: Promise<Raw<"error" | "sessions">>;
}) {
  const m = await getMessages();
  const { error, sessions } = firstQueryValues(await searchParams);
  const session = await readSession();
  if (session.status === "ok") redirect(routes.projects());
  // 세션을 못 읽었으면 `?error=`가 없어도 장애 문구를 보인다 — 로그인 버튼만 보이면 사용자가 헛로그인한다.
  const jar = await cookies();
  const dest = destFromCallbackUrl((jar.get("__Secure-authjs.callback-url") ?? jar.get("authjs.callback-url"))?.value);
  const shown = error ?? (session.status === "unavailable" ? "Unavailable" : undefined);

  return (
    <AuthLayout m={m} decoration>
      <AuthColumn>
        <MalmoiMark size={48} />
        {/* ⚠️ **설명이 없다** — 제품 설명은 랜딩이 맡는다 (8-1b). */}
        <AuthHeading title={m.signIn.title} />

        <div className="flex w-full flex-col gap-2">
          {/* ⚠️ **primary는 화면당 하나다** (DESIGN §2) — 시안이 GitHub을 채움으로 그렸다. */}
          <ProviderButton provider="github" label={m.signIn.github} variant="primary" />
          <ProviderButton provider="google" label={m.signIn.google} variant="default" />

          {dest.kind === "invite" && (
            <InlineLink href={routes.invite(dest.token)} className="text-center text-sm ">
              {m.signIn.backToInvitation}
            </InlineLink>
          )}
          {dest.kind === "oauth" && (
            <InlineLink href={routes.oauthAuthorize({ request: dest.requestId })} className="text-center text-sm ">
              {m.signIn.backToAuthorization}
            </InlineLink>
          )}
          <p className="text-muted-foreground text-center text-xs leading-relaxed">
            {m.signIn.consent.before}
            {/* self-hosted에서는 운영자 방침으로 나가므로 새 탭이다 — 로그인 흐름을 떠나지 않는다(`consentLinkProps`). */}
            <InlineLink href={routes.privacy()} {...consentLinkProps(deploymentMode())}>
              {m.signIn.consent.link}
            </InlineLink>
            {m.signIn.consent.after}
          </p>
        </div>
      </AuthColumn>

      {/* 렌더하지 않는다 — `?error=`·`?sessions=`를 토스트로 옮기는 조각이다. */}
      <AuthToast error={shown === undefined ? undefined : signInErrorMessage(m, shown)} sessions={sessions} />
    </AuthLayout>
  );
}

/**
 * ⚠️ **함수 이름을 바꾸지 않는다.** `lib/session-revocation/__tests__/normal-login.test.tsx`가
 * `child.type.name === "ProviderButton"`으로 이것을 찾고, 그 테스트는 **POSTMORTEM 2026-09-10의
 * 유일한 방어선**이다 — `clearAuthRoundtripCookies()`가 `signIn()`보다 먼저 불리는 것을 고정한다.
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
        await clearAuthRoundtripCookies();
        await signIn(provider, { redirectTo: "/projects" });
      }}
    >
      {/* ⚠️ 높이는 `size="lg"`가 든다 (DESIGN §8) — 호출부는 폭·여백만 덧댄다. */}
      <ProviderSubmit
        label={label}
        variant={variant}
        icon={provider === "github" ? <GithubIcon aria-hidden className="size-4" /> : <GoogleIcon aria-hidden className="size-4" />}
      />
    </form>
  );
}
