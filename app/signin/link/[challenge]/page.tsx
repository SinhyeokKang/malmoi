import { clearAuthRoundtripCookies } from "@/lib/auth/roundtrip-cookies";
import Image from "next/image";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { SubmitButton } from "@/components/submit-button";
import { AuthColumn, AuthHeading } from "@/components/signin/auth-column";
import { AuthLayout } from "@/components/signin/auth-layout";
import { GithubIcon, GoogleIcon } from "@/components/signin/brand-icons";
import { Alert } from "@/components/ui/alert";
import { EntityCard } from "@/components/ui/entity-card";
import { ButtonLink } from "@/components/ui/button";
import { getPrisma } from "@/lib/db";
import { logCaught } from "@/lib/failure";
import { requestOrigin } from "@/lib/github-connect/origin";
import { m } from "@/lib/i18n";
import { withLinkStart } from "@/lib/login-link/http";
import { linkErrorMessage, providerLabel } from "@/lib/login-link/message";
import { linkCookie, outcomeUrl, type LinkDest, type LoginProvider } from "@/lib/login-link/policy";
import { loadChallengeView } from "@/lib/login-link/view";
import { routes } from "@/lib/routes";
import { firstQueryValues, type Raw } from "@/lib/search-params";
import logo from "@/public/brand/malmoi-icon-black.svg";

/**
 * 병합 안내 화면 — **거부를 안내로 바꾸는 자리다** (PRODUCT §4.3 ④).
 *
 * ⚠️ **인가가 없다 — challenge가 대신한다.** `middleware.ts`의 matcher에 넣지 않는다: 넣으면
 * 비로그인이 `/signin`으로 튕겨 이 화면이 존재할 이유가 사라진다 (`/invite/[token]`과 같은 판단).
 *
 * ⚠️ **노출 최소화**: 서버가 `loadChallengeView`로 **보일 값만** 만들어 내려준다 — 마스킹한
 * 이메일 · provider · 가입 월. 클라이언트에서 가리면 원문이 이미 RSC 페이로드에 있다.
 *
 * ⚠️ **만료를 이 화면으로 말하지 않는다** (완료 조건 5) — `/signin`으로 되돌린다. 다시 그리면
 * 그 상태가 또 하나의 표면이 된다.
 */
export default async function LinkAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ challenge: string }>;
  searchParams: Promise<Raw<"e">>;
}) {
  const { challenge } = await params;
  const { e } = firstQueryValues(await searchParams);

  let view;
  try {
    view = await loadChallengeView(getPrisma(), challenge, new Date());
  } catch (error) {
    logCaught("login-link", "page", error);
    // 장애와 만료를 가른다 — 같은 화면으로 접으면 다시 시도해도 소용없는 사람에게 재시도를 준다.
    redirect(routes.signIn({ error: "Unavailable" }));
  }
  if (view === null) redirect(routes.signIn({ error: "LinkExpired" }));

  return (
    <AuthLayout>
      <AuthColumn>
        <Image src={logo} alt="" width={48} height={48} priority />
        <AuthHeading
          title={m.link.title}
          description={m.link.description(providerLabel(view.pending), providerLabel(view.have))}
        />

        {/*
          ⚠️ **실패는 기본 상태 + `Alert` 한 장이 전부다** (DESIGN §6.62) — 부제·각주·구분선·버튼
          라벨이 그대로다. 실패에서 레이아웃을 갈아치우면 사용자가 같은 화면으로 돌아온 것을
          못 알아본다. 자리는 설명 **아래**, 카드 **위**.

          ⚠️ **규약 8의 Layer A는 아니다 — 의도적 예외다.** 인라인인 이유는 **메시지와 조치가 한
          자리에 있어야** 해서다: 다시 누를 버튼이 바로 아래에 있고, 토스트는 그 둘을 화면의
          반대 끝으로 가른다. challenge가 **살아 있다**(ARCHITECTURE "계정 병합")는 것이 이 상태의 전제다.
        */}
        {e !== undefined && (
          <Alert variant="danger" className="w-full">
            {linkErrorMessage(e)}
          </Alert>
        )}

        {/*
          ⚠️ **1행은 마스킹한 이메일이고 아바타만 이름·이미지에서 온다** — 주소가 "어느 계정인가"의
          답이고, 아바타는 **셸과 같은 얼굴로 보이는 것**이 일이다(같은 계정이 화면마다 다른
          글자·색이면 아바타가 소음이 된다). 우측은 provider 마크 하나이고, 브랜드 마크는 무채색
          위계의 대상이 아니라 `--foreground`를 그대로 받는다 (DESIGN §6.2).
        */}
        <EntityCard
          name={view.emailLabel}
          avatarName={view.name ?? view.emailLabel}
          image={view.image}
          secondary={`${providerLabel(view.have)} · ${joinedLabel(view.joined)}`}
          meta={view.have === "github" ? <GithubIcon className="size-4" /> : <GoogleIcon className="size-4" />}
        />

        <div className="flex w-full flex-col gap-2">
          <ProviderButton provider={view.have} challenge={challenge} dest={view.dest} />
          <p className="text-muted-foreground text-center text-xs leading-relaxed">{m.link.footnote}</p>
        </div>

        <hr className="border-border w-full" />

        {/* 이 화면에서 나가는 유일한 다른 길 — 없으면 다른 계정의 사람이 갇힌다. */}
        <ButtonLink href={routes.signIn()} size="lg" className="w-full">
          {m.invite.otherAccount}
        </ButtonLink>
      </AuthColumn>
    </AuthLayout>
  );
}

/** 가입 월 — `lang="en"`이라 로케일을 고정한다. 서버에서만 렌더되므로 hydration이 갈리지 않는다. */
function joinedLabel(joined: Date): string {
  return `Joined ${new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(joined)}`;
}

/**
 * ⚠️ **함수 이름을 바꾸지 않는다.** `lib/session-revocation/__tests__/normal-login.test.tsx`가
 * `child.type.name === "ProviderButton"`으로 이것을 찾고, 그 테스트는 POSTMORTEM 2026-09-10의
 * 방어선이다 — 이 화면이 **일반 로그인 진입점 셋째**라 버려진 회수 왕복을 먼저 지워야 한다.
 */
function ProviderButton({
  provider,
  challenge,
  dest,
}: {
  provider: LoginProvider;
  challenge: string;
  dest: LinkDest;
}) {
  return (
    <form
      className="w-full"
      action={async () => {
        "use server";
        await clearAuthRoundtripCookies();
        const h = await headers();
        const origin = requestOrigin({ host: h.get("host"), forwardedProto: h.get("x-forwarded-proto") });
        const cookie = linkCookie(origin?.secure ?? false);
        // 원문 토큰은 주소창과 이 쿠키에만 있다 — DB엔 해시만 남는다 (ARCHITECTURE "계정 병합").
        (await cookies()).set(cookie.name, challenge, cookie.options);
        // 시작 스코프 안에서 불러야 Auth.js가 state를 **우리 쿠키 이름**으로 저장한다 (불변식 3).
        await withLinkStart(origin?.secure ?? false, () => signIn(provider, { redirectTo: outcomeUrl(dest) }));
      }}
    >
      <SubmitButton variant="primary" size="lg" className="w-full">
        {m.link.confirm(providerLabel(provider))}
      </SubmitButton>
    </form>
  );
}
