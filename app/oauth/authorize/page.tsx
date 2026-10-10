import { Link as InlineLink } from "@/components/ui/link";
import type { Metadata } from "next";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { signIn } from "@/auth";
import { AppCard } from "@/components/oauth/app-card";
import { ConsentPanel, type ConsentAccount } from "@/components/oauth/consent-panel";
import { AuthColumn, AuthHeading } from "@/components/signin/auth-column";
import { AuthLayout } from "@/components/signin/auth-layout";
import { GithubIcon, GoogleIcon } from "@/components/signin/brand-icons";
import { ProviderSubmit } from "@/components/signin/provider-button";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { MalmoiMark } from "@/components/ui/malmoi-mark";
import { readSession } from "@/lib/auth/read-session";
import { clearAuthRoundtripCookies } from "@/lib/auth/roundtrip-cookies";
import { decodeUser } from "@/lib/credentials/records";
import { credentialIO } from "@/lib/credentials/access";
import { getPrisma } from "@/lib/db";
import { logCaught } from "@/lib/failure";
import type { Messages } from "@/lib/i18n";
import type { UiLocale } from "@/lib/i18n/locales";
import { getDateStyle, getMessages } from "@/lib/i18n/server";
import { en } from "@/messages/en";
import { providerLabel } from "@/lib/login-link/message";
import { enabledLoginProviders } from "@/lib/auth/login-providers";
import { LOGIN_PROVIDERS, signInButtons, type LoginProvider } from "@/lib/login-link/policy";
import { planConnectedApps } from "@/lib/mcp/view";
import { parseAuthorizeRequest } from "@/lib/oauth/authorize";
import { planAuthorizeView, returnHost, type AuthorizeRequestState, type AuthorizeView } from "@/lib/oauth/authorize-view";
import { clientIdLabel } from "@/lib/oauth/client-metadata";
import { oauthEndpoint } from "@/lib/oauth/endpoint";
import { readAuthorizationRequest, storeAuthorizationRequest } from "@/lib/oauth-server/authorize";
import { fetchClientMetadata } from "@/lib/oauth-server/client-metadata-fetch";
import { deploymentMode } from "@/lib/deployment/mode";
import { routes } from "@/lib/routes";
import { consentLinkProps } from "@/lib/seo/public-response";
import { formatDay } from "@/lib/date-format";

/**
 * ⚠️ **색인 거부 + referrer 없음** — 요청 ID가 주소에 실린다(`/invite/[token]`과 같은 이유). ⚠️ `lib/seo/analytics.ts`의 추적 허용 목록에도 없다.
 */
export const metadata: Metadata = { title: en.oauthAuthorize.title, robots: { index: false, follow: false }, referrer: "no-referrer" };

type Params = Record<string, string | string[] | undefined>;

/**
 * **MCP 클라이언트의 로그인·동의 화면** (mcp-oauth design §1 · §6.1 · 핸드오프 `design_handoff_mcp_oauth`). 셸 밖이고 KV 패널이 없다.
 *
 * 두 입구가 있다:
 * 1. **클라이언트가 연 OAuth 쿼리** — 쿼리 판정 → CIMD 문서 가져오기 → 콜백 등록 대조 → 요청 행 저장 → `?request=<id>`로 정규화한다.
 *    ⚠️ **콜백 대조를 지나기 전의 어떤 실패도 리다이렉트하지 않는다**(open redirect) — 화면이 끝낸다(`1o`). 지난 뒤의 쿼리 오류도 지금은 화면이
 *    끝낸다(콜백으로 오류를 돌려보내는 경로를 두지 않았다 — 두 CLI는 올바른 쿼리만 보낸다, design §0.1).
 *    ⚠️ CIMD 가져오기의 `blocked-address`·`unreachable`·`invalid-document`는 **한 문구**다 — 어느 호스트가 사설 주소로 풀리는지 말하지 않는다.
 * 2. **`?request=<id>`** — 로그인 왕복(공급자 · 계정 연결 challenge · `/signin` 복귀 · `Not you?`)이 돌아오는 정규형. 판정 순서는 `planAuthorizeView`다.
 *
 * ⚠️ **1차 차단의 보호 경로(`isProtectedPath`) 밖이다** — 무세션이 정상 진입이고 이 화면이 스스로 로그인 버튼을 그린다(`/invite/[token]`과 같다).
 * 본판정은 Authorize·Deny Action의 `readSession`이다. ⚠️ 이 페이지는 쿠키를 읽는다 — `no-cookie-reads.test.ts`의 비쿠키 트리 밖이다.
 */
export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const [m, style] = await Promise.all([getMessages(), getDateStyle()]);
  const params = await searchParams;
  const endpoint = oauthEndpoint(await headers());
  const requestId = single(params, "request");
  const e = single(params, "e");

  if (requestId === undefined) {
    // ① 클라이언트가 연 쿼리. 허용 밖 origin이면 이 AS가 발급할 대상이 아니다.
    const now = new Date();
    const parsed = endpoint === null ? null : parseAuthorizeRequest(params, endpoint.resource);
    if (endpoint === null || parsed === null || !parsed.ok) return <Ended m={m} view={await endedView("invalid")} retryHref={null} />;
    const fetched = await fetchClientMetadata(parsed.request.clientId);
    if (!fetched.ok) return <Ended m={m} view={await endedView("invalid")} retryHref={null} />;
    let stored: Awaited<ReturnType<typeof storeAuthorizationRequest>>;
    try {
      stored = await storeAuthorizationRequest(getPrisma(), { request: parsed.request, client: fetched.client, endpoint, now });
    } catch (error) {
      logCaught("oauth-authorize", "store", error);
      // 같은 쿼리로 다시 — 저장 전이라 새 요청이 선다.
      return <Ended m={m} view={await endedView("error")} retryHref={retryQuery(params)} />;
    }
    if (!stored.ok) return <Ended m={m} view={await endedView("invalid")} retryHref={null} />;
    redirect(routes.oauthAuthorize({ request: stored.requestId }));
  }

  // ② 정규형. 다른 origin의 요청은 "없는 요청"이다 — 같은 DB를 보는 preview·로컬이 서로의 요청을 이어 받지 않는다.
  const now = new Date();
  let state: AuthorizeRequestState;
  let request: { clientId: string; clientName: string | null; redirectUri: string } | null = null;
  if (endpoint === null) state = "missing";
  else {
    try {
      const read = await readAuthorizationRequest(getPrisma(), { requestId, endpoint, now });
      if (read.status === "ok") {
        state = "ok";
        request = read.request;
      } else state = read.reason;
    } catch (error) {
      logCaught("oauth-authorize", "read", error);
      state = "error";
    }
  }
  const session = await readSession();
  const view = planAuthorizeView({ request: state, session: session.status, e });
  const self = routes.oauthAuthorize({ request: requestId });
  if (view.kind === "ended" || request === null) return <Ended m={m} view={view.kind === "ended" ? view : await endedView("error")} retryHref={self} />;

  const app = { name: request.clientName ?? request.clientId, ident: clientIdLabel(request.clientId) };
  if (view.kind === "sign-in" || session.status !== "ok") {
    return (
      <AuthLayout m={m}>
        <AuthColumn>
          <MalmoiMark size={48} />
          <AuthHeading title={m.oauthAuthorize.title} description={m.oauthAuthorize.signInDescription} />
          {/* `1k` — 동의 중 세션이 끝났다. 낭독이 먼저 오도록 `role="alert"`다(핸드오프 §8 탭 순서). */}
          {view.kind === "sign-in" && view.notice === "signed-out" && (
            <div role="alert" className="w-full">
              <Alert variant="warning">{m.oauthAuthorize.sessionEnded}</Alert>
            </div>
          )}
          <AppCard m={m} name={app.name} ident={app.ident} />
          <div className="flex w-full flex-col gap-2">
            {/*
              `Not you?` 뒤(`1s`)에는 첫 공급자 버튼에 포커스 — 계정을 바꾸러 온 사람의 다음 행동이다. 버튼은 켜진 것만, 첫째가 primary이고
              (`signInButtons`) 조건은 그대로 대상만 index 0이다 — 화면 상태를 공용 판정에 넣지 않는다.
            */}
            {signInButtons(enabledLoginProviders()).map(({ provider, variant }, index) => (
              <ProviderButton key={provider} m={m} provider={provider} variant={variant} requestId={requestId} autoFocus={index === 0 && view.kind === "sign-in" && view.notice === "switch"} />
            ))}
            <p className="text-muted-foreground text-center text-xs leading-relaxed">
              {m.signIn.consent.before}
              {/* self-hosted에서는 운영자 방침으로 나가므로 새 탭이다 — 이 동의 요청을 떠나지 않는다(`consentLinkProps`). */}
              <InlineLink href={routes.privacy()} {...consentLinkProps(deploymentMode())}>
                {m.signIn.consent.link}
              </InlineLink>
              {m.signIn.consent.after}
            </p>
          </div>
        </AuthColumn>
      </AuthLayout>
    );
  }

  const userId = session.userId;
  let loaded: { account: ConsentAccount; projects: { id: string; name: string; repo: string }[]; existing: ReturnType<typeof planConnectedApps>[number] | null };
  try {
    loaded = await loadConsent(m, userId, request.clientId, now);
  } catch (error) {
    logCaught("oauth-authorize", "consent", error);
    return <Ended m={m} view={await endedView("error")} retryHref={self} />;
  }
  const { account, projects, existing } = loaded;
  // 재동의는 기존 연결의 값으로 채운다(핸드오프 §13 결정 2 — 토큰 회전과 같은 판정, 범위는 현재 멤버십 교집합).
  const initial = existing === null
    ? { grants: [], scope: "all" as const, projectIds: [] }
    : { grants: existing.grants, scope: existing.scope.kind, projectIds: existing.scope.kind === "all" ? [] : existing.scope.projectIds };

  return (
    <AuthLayout m={m} scroll>
      {/* `scroll-pb-24` — 바닥 sticky CTA 묶음(사유 줄 + 버튼)이 Tab 포커스를 덮지 않게 한다(WCAG 2.4.11). 동의 단계만 `<main>` 안이 스크롤한다 — 폼이 뷰포트보다 길다(핸드오프 §7.1: padding 48/32/32 · 480 컬럼). */}
      <div className="min-h-0 w-full flex-1 overflow-y-auto scroll-pb-24 px-8 pt-12 pb-8">
        <div className="mx-auto flex w-full max-w-120 flex-col items-center gap-4">
          <MalmoiMark size={48} />
          <AuthHeading title={m.oauthAuthorize.title} description={m.oauthAuthorize.consentDescription} />
          <ConsentPanel
            requestId={requestId}
            app={app}
            returnTo={returnHost(request.redirectUri)}
            account={account}
            projects={projects}
            initial={initial}
            replacesOn={existing === null ? null : formatDay(existing.createdAt, style)}
          />
        </div>
      </div>
    </AuthLayout>
  );
}

/** 남이 정한 키다 — `Object.hasOwn`으로만 읽고, 중복이면 없는 것으로 본다. */
function single(params: Params, key: string): string | undefined {
  if (!Object.hasOwn(params, key)) return undefined;
  const value = params[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** 저장 장애의 `Try again` — 클라이언트가 연 쿼리 그대로. 값은 남이 정한 것이지만 같은 경로로만 돌아간다(origin·경로는 우리가 정한다). */
function retryQuery(params: Params): string {
  const query = new URLSearchParams();
  for (const key of Object.keys(params)) {
    const value = params[key];
    for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, one);
  }
  return `${routes.oauthAuthorize()}?${query.toString()}`;
}

/** 종료 화면의 판정 — 요청을 못 믿는 갈래라 세션만 읽어 출구(내 프로젝트)를 고른다. */
async function endedView(request: "invalid" | "error"): Promise<Extract<AuthorizeView, { kind: "ended" }>> {
  const session = await readSession();
  const view = planAuthorizeView({ request, session: session.status, e: undefined });
  if (view.kind !== "ended") throw new Error("unreachable: invalid/error requests always end");
  return view;
}

async function loadConsent(m: Messages, userId: string, clientId: string, now: Date) {
  const prisma = getPrisma();
  const [user, accounts, members, connection] = await Promise.all([
    credentialIO(async () => {
      const row = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailLookup: true, name: true, image: true } });
      return row === null ? null : decodeUser(row);
    }),
    prisma.account.findMany({ where: { userId, provider: { in: [...LOGIN_PROVIDERS] } }, select: { provider: true } }),
    prisma.projectMember.findMany({
      where: { userId, project: { archivedAt: null } },
      select: { project: { select: { id: true, name: true, repoOwner: true, repoName: true } } },
      orderBy: { project: { name: "asc" } },
    }),
    prisma.oAuthConnection.findUnique({
      where: { userId_clientId: { userId, clientId } },
      select: { id: true, clientId: true, clientName: true, grants: true, allProjects: true, projectIds: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    }),
  ]);
  if (user === null) throw new Error("oauth-authorize: session user has no row");
  const projects = members.map(({ project }) => ({ id: project.id, name: project.name, repo: `${project.repoOwner}/${project.repoName}` }));
  /*
    `Signed in with {provider}` — 세션은 어느 수단으로 들어왔는지 기록하지 않는다. 수단이 하나면 그것이 답이고, 둘이면 말할 수 없으니 줄을 그리지 않는다
    (추측한 수단을 보이면 "내 계정이 아닌가" 하고 되묻게 된다).
  */
  const methods = accounts.map((a) => a.provider).filter((p): p is LoginProvider => (LOGIN_PROVIDERS as readonly string[]).includes(p));
  const only = methods.length === 1 ? methods[0] : undefined;
  const account: ConsentAccount = {
    email: user.email,
    avatarName: user.name ?? user.email,
    image: user.image ?? null,
    secondary: only === undefined ? null : m.oauthAuthorize.signedInWith(providerLabel(m, only)),
  };
  const existing = connection === null ? null : planConnectedApps({ rows: [connection], memberProjectIds: projects.map((p) => p.id), now })[0] ?? null;
  return { account, projects, existing };
}

function Ended({ m, view, retryHref }: { m: Messages; view: Extract<AuthorizeView, { kind: "ended" }>; retryHref: string | null }) {
  const copy = {
    invalid: m.oauthAuthorize.ended.invalid,
    "not-found": m.oauthAuthorize.ended.notFound,
    expired: m.oauthAuthorize.ended.expired,
    used: m.oauthAuthorize.ended.used,
    unavailable: m.oauthAuthorize.ended.unavailable,
  }[view.reason];
  let cta: ReactNode = null;
  // ⚠️ 클라이언트로 돌아가는 버튼은 없다(핸드오프 §13 결정 5) — 요청을 못 믿으면 돌려보낼 곳도 못 믿는다.
  if (view.cta === "retry" && retryHref !== null) cta = <ButtonLink variant="primary" size="lg" className="w-full" href={retryHref}>{m.common.retry}</ButtonLink>;
  if (view.cta === "projects") cta = <ButtonLink size="lg" className="w-full" href={routes.projects()}>{m.invite.openProjects}</ButtonLink>;
  return (
    <AuthLayout m={m}>
      <AuthColumn>
        <MalmoiMark size={48} />
        <AuthHeading title={copy.title} description={copy.body} />
        {cta}
      </AuthColumn>
    </AuthLayout>
  );
}

/**
 * ⚠️ **함수 이름을 바꾸지 않는다** — `lib/session-revocation/__tests__/normal-login.test.tsx`가 `ProviderButton`이라는 이름으로 찾아
 * `clearAuthRoundtripCookies()`가 `signIn()`보다 먼저 불리는 것을 고정한다(POSTMORTEM 2026-09-10). 이 화면이 일반 로그인 진입점 넷째다.
 * ⚠️ **`redirectTo`는 `?request=` 정규형이다** — 요청 ID 하나가 목적지이고(`destFromCallbackUrl`이 그것만 갈래로 남긴다), `e`는 싣지 않는다.
 */
function ProviderButton({ m, provider, variant, requestId, autoFocus }: { m: Messages; provider: LoginProvider; variant: "primary" | "default"; requestId: string; autoFocus: boolean }) {
  return (
    <form
      className="w-full"
      action={async () => {
        "use server";
        await clearAuthRoundtripCookies();
        await signIn(provider, { redirectTo: routes.oauthAuthorize({ request: requestId }) });
      }}
    >
      <ProviderSubmit
        label={provider === "github" ? m.signIn.github : m.signIn.google}
        variant={variant}
        icon={provider === "github" ? <GithubIcon aria-hidden className="size-4" /> : <GoogleIcon aria-hidden className="size-4" />}
        autoFocus={autoFocus}
      />
    </form>
  );
}
