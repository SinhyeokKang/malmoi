import { clearAuthRoundtripCookies } from "@/lib/auth/roundtrip-cookies";
import { decodeInvitation, decodeUser } from "@/lib/credentials/records";
import { credentialIO } from "@/lib/credentials/access";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { signIn, signOut } from "@/auth";
import { InviteProjectCard } from "@/components/invite/project-card";
import { AuthColumn, AuthHeading } from "@/components/signin/auth-column";
import { AuthLayout } from "@/components/signin/auth-layout";
import { GithubIcon, GoogleIcon } from "@/components/signin/brand-icons";
import { ProviderSubmit } from "@/components/signin/provider-button";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { maskEmail } from "@/lib/auth/email";
import { hashInviteToken } from "@/lib/auth/invitation";
import { planInviteView } from "@/lib/auth/invite-view";
import { inviteErrorMessage } from "@/lib/auth/message";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import logo from "@/public/brand/malmoi-icon-black.svg";
import { firstQueryValues, type Raw } from "@/lib/search-params";

import { acceptInvitation } from "../actions";

/**
 * 초대 수락 화면 — **셸 밖 카드다** (design §3.14 · DESIGN §5.1).
 *
 * ⚠️ **미들웨어 matcher 밖이다** (design §4.1). 비로그인으로 열려야 토큰이 보존된다 — matcher에
 * 넣으면 세션 없는 요청이 로그인 화면(`/signin`)으로 302되고 그 순간 링크의 토큰이 사라진다.
 *
 * ⚠️ **비로그인에게 보이는 것은 마스킹한 이메일·프로젝트 이름·역할뿐이다.** 조건부 렌더이지만
 * 새는 데이터가 그것이 전부라 허용한다 — 번역 데이터는 이 페이지가 조회하지 않는다.
 *
 * 실패는 이 초대의 지속되는 조건이므로 모두 인라인이다(DESIGN §6.25).
 * planInviteView가 알림과 CTA를 함께 고른다. 인가 경계는 여전히 수락 Action이다.
 */

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  // ⚠️ **이 인자를 빠뜨리면 아래 `redirect`가 넘기는 사유가 통째로 사라진다** — 주소창만 바뀌고
  // 화면은 그대로라, 사용자에게는 버튼이 안 눌린 것으로 보인다 (issue #2, POSTMORTEM 2026-09-06).
  searchParams: Promise<Raw<"e">>;
}) {
  const { token } = await params;
  const { e } = firstQueryValues(await searchParams);
  const session = await readSession();
  const invitation = session.status === "unavailable" ? undefined : await credentialIO(async () => {
    const row = await getPrisma().projectInvitation.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      select: {
        id: true,
        projectId: true,
        emailLookup: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        // 수락 판단에는 살아 있는 로케일 코드만 필요하다. 규모를 노출하는 숫자는 싣지 않는다.
        // `slug`는 **이미 멤버인 사람을 그 프로젝트로 보내는 데만** 쓴다 (2026-09-12).
        project: { select: { name: true, slug: true, locales: { where: { orphaned: false }, select: { code: true }, orderBy: { code: "asc" } } } },
      },
    });
    return row === null ? null : decodeInvitation(row);
  }).catch(() => undefined);

  const input = { session: session.status, invitation, viewerEmail: null, alreadyMember: false, queryError: e, now: new Date() };
  let view = planInviteView(input);
  // 비로그인과 사용할 수 없는 초대에서는 계정·멤버십을 조회하지 않는다.
  if (view.kind !== "blocked" && invitation != null && session.status === "ok") {
    try {
      // acceptInvitation과 대조 출처가 같아야 하므로 세션 대신 User 행을 읽는다.
      const viewer = await credentialIO(async () => {
        const row = await getPrisma().user.findUnique({
          where: { id: session.userId },
          select: { id: true, email: true, emailLookup: true },
        });
        return row === null ? null : decodeUser(row);
      });
      const member = await getPrisma().projectMember.findUnique({
        where: { projectId_userId: { projectId: invitation.projectId, userId: session.userId } },
        select: { userId: true },
      });
      view = planInviteView({ ...input, viewerEmail: viewer?.email ?? null, alreadyMember: member !== null, now: new Date() });
    } catch {
      view = planInviteView({ ...input, session: "unavailable" });
    }
  }

  const email = view.kind !== "blocked" && invitation != null ? maskEmail(invitation.email) : null;
  let cta: ReactNode;
  switch (view.kind) {
    case "blocked":
      cta = view.retry ? (
        <form method="get" action={routes.invite(token)}>
          <Button type="submit">{m.common.retry}</Button>
        </form>
      ) : null;
      break;
    case "sign-in":
      cta = (
        <div className="flex w-full flex-col gap-2">
          <ProviderButton provider="github" token={token} />
          <ProviderButton provider="google" token={token} />
          {/* 로그인 약관과 같이 행동을 먼저 읽도록 캡션은 버튼 아래에 둔다. */}
          <p className="text-muted-foreground text-center text-xs leading-relaxed">
            {m.invite.signInHint(email ?? "")}
          </p>
        </div>
      );
      break;
    case "wrong-account":
      // ⚠️ **두 갈래의 출구가 반대다** — 불일치는 **다른 계정**으로 들어와야 하고, 이미 멤버인 사람은
      // **이미 들어와 있다.** 뒤엣것에 로그아웃 버튼을 주면 화면의 문구와 반대되는 행동만 남는다
      // (셸 밖이라 사이드바가 없어 시키는 일을 할 수단이 0이었다 — 2026-09-12 실물 검증).
      cta = view.notice === "already-member" && invitation != null ? (
        <ButtonLink variant="primary" size="lg" className="w-full" href={routes.project(invitation.project.slug)}>
          {m.invite.openProject}
        </ButtonLink>
      ) : (
        <form className="w-full" action={async () => {
          "use server";
          await signOut({ redirectTo: routes.invite(token) });
        }}>
          <SubmitButton variant="primary" size="lg" className="w-full">
            {m.invite.otherAccount}
          </SubmitButton>
        </form>
      );
      break;
    case "accept":
      cta = (
        <form className="w-full" action={async () => {
          "use server";
          const result = await acceptInvitation({ token });
          redirect(result.ok ? routes.project(result.slug) : `${routes.invite(token)}?e=${result.error}`);
        }}>
          <SubmitButton variant="primary" size="lg" className="w-full">
            {m.invite.accept}
          </SubmitButton>
        </form>
      );
      break;
  }

  return (
    <Card>
      <AuthHeading title={m.invite.title} description={email === null ? undefined : m.invite.sentTo(email)} />
      {view.notice !== null && <Alert variant="danger" className="w-full">{inviteErrorMessage(view.notice)}</Alert>}
      {(view.kind === "accept" || view.kind === "wrong-account") && invitation != null && (
        <InviteProjectCard
          name={invitation.project.name}
          role={m.projects.role[invitation.role]}
          // ⚠️ `Locale` 행은 표면마다 선다 — 표면이 둘이면 같은 코드가 둘 온다 (malmoi#48). 조회가 `code asc`라 순서는 남는다.
          locales={[...new Set(invitation.project.locales.map((locale) => locale.code))]}
        />
      )}
      {cta}
    </Card>
  );
}

/**
 * 셸 밖 카드 — **로그인 화면과 같은 2열 골격을 쓴다** (8-1b). 번역자에게는 이 화면이 제품의 첫
 * 얼굴이라 따로 그리면 같은 제품이 두 얼굴이 된다.
 */
function Card({ children }: { children: ReactNode }) {
  return (
    <AuthLayout>
      <AuthColumn>
        <Image src={logo} alt="" width={48} height={48} priority />
        {children}
      </AuthColumn>
    </AuthLayout>
  );
}

/**
 * ⚠️ **`/signin`의 버튼과 같은 것을 쓴다** (2026-09-12 실물 대조) — 그 전까지 이 화면만 아이콘 없는
 * 맨 `SubmitButton`에 `"Sign in with …"`이라는 **다른 문구**를 썼다. 결정이 아니라 드리프트였다:
 * 같은 자리에서 같은 일을 하는 버튼이 화면마다 다르게 생기면, 번역자에게 **첫 얼굴인 이 화면**이
 * 로그인 화면과 다른 제품처럼 보인다 (`AuthLayout`을 둘이 공유하는 이유와 같은 근거).
 *
 * ⚠️ **GitHub이 `primary`인 것도 그쪽을 따른다.** design §6은 *"어느 쪽으로 가입했는지 화면이
 * 모르므로 primary가 없다"*로 둘 다 `default`를 적었는데, **그 논거는 `/signin`에도 똑같이 성립해
 * 두 화면을 가르지 못한다.** 그리고 로그인이 유일한 할 일인 화면에 primary가 0이면 DESIGN §2의
 * "primary는 화면당 하나"가 그 화면에서 성립하지 않는다.
 *
 * ⚠️ **함수 이름을 바꾸지 않는다** — `normal-login.test.tsx`가 이것을 이름으로 찾는다.
 */
function ProviderButton({ provider, token }: { provider: "github" | "google"; token: string }) {
  return (
    <form
      className="w-full"
      action={async () => {
        "use server";
        await clearAuthRoundtripCookies();
        await signIn(provider, { redirectTo: routes.invite(token) });
      }}
    >
      <ProviderSubmit
        label={provider === "github" ? m.signIn.github : m.signIn.google}
        variant={provider === "github" ? "primary" : "default"}
        icon={provider === "github" ? <GithubIcon className="size-4" /> : <GoogleIcon className="size-4" />}
      />
    </form>
  );
}
