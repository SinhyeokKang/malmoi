import { clearLinkCookies } from "@/lib/login-link/clear-cookies";
import { clearRevocationCookies } from "@/lib/session-revocation/clear-cookies";
import { decodeInvitation } from "@/lib/credentials/records";
import { credentialIO } from "@/lib/credentials/access";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { signIn, signOut } from "@/auth";
import { InviteProjectCard } from "@/components/invite/project-card";
import { AuthColumn, AuthHeading } from "@/components/signin/auth-column";
import { AuthLayout } from "@/components/signin/auth-layout";
import { AuthToast } from "@/components/signin/auth-toast";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { maskEmail } from "@/lib/auth/email";
import { hashInviteToken } from "@/lib/auth/invitation";
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
 * ⚠️ **실패가 두 층에서 오고, 8-1b가 그 둘을 서로 다른 표면에 둔다** (규약 8의 첫 시험 사례):
 *
 * - **Layer A** — 행을 읽자마자 갈리는 넷(`not-found`·`already-accepted`·`expired`·`unavailable`)은
 *   **인라인 `Notice`로 남는다.** 그것이 **페이지 콘텐츠 전부**이기 때문이다 — 토스트로 옮기면
 *   빈 카드 + 우하단 토스트가 되고, 만료된 링크를 연 사람이 아무것도 없는 화면을 본다.
 * - **Layer B** — 수락 버튼을 눌러서 나는 셋(`email-mismatch`·`already-member`·`unauthorized`)은
 *   `?e=`로 돌아와 **토스트**가 낸다. 전역 결과를 내는 이벤트이고, 그 뒤에도 화면은 그대로 쓸 수 있다.
 *
 * 여섯을 각자 다른 한 줄로 보이는 것이 이 화면의 요지다 — 판정을 갈라놓고 화면을 안 갈라놓으면
 * 사용자가 왜 실패했는지 모른다.
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
  // 세션을 못 읽었으면 초대 행도 못 읽는다(같은 DB) — 비로그인 화면으로 접지 않고 장애라고 말한다.
  if (session.status === "unavailable") return <Notice retryToken={token}>{m.errors.invite.unavailable}</Notice>;

  const invitation = await credentialIO(async () => {
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
      /**
       * ⚠️ **국기는 번역자가 자기 언어가 있는지 보는 값이다** (account-linking §7) — orphaned는
       * 리포에서 사라진 로케일이라 수락 판단의 재료가 아니다. **숫자는 싣지 않는다.**
       */
      project: { select: { name: true, locales: { where: { orphaned: false }, select: { code: true }, orderBy: { code: "asc" } } } },
    },
  });
    return row === null ? null : decodeInvitation(row);
  }).catch(() => undefined);
  if (invitation === undefined) return <Notice retryToken={token}>{m.errors.invite.unavailable}</Notice>;

  if (invitation === null) return <Notice>{m.errors.invite["not-found"]}</Notice>;
  if (invitation.acceptedAt !== null) return <Notice>{m.errors.invite["already-accepted"]}</Notice>;
  if (invitation.expiresAt.getTime() <= Date.now()) return <Notice>{m.errors.invite.expired}</Notice>;

  const email = maskEmail(invitation.email);

  /**
   * ⚠️ **두 분기가 함께 쓴다.** `unauthorized`는 세션이 끊긴 뒤에 오므로 아래 로그인 화면에서만
   * 보이고, `email-mismatch`·`already-member`는 로그인한 화면에서만 온다 — 한쪽에만 두면
   * 그 사유의 문구가 도달할 수 없다.
   *
   * ⚠️ **주소창 값을 단언하지 않는다** — `inviteErrorMessage`가 모르는 값에 폴백 문구를 낸다
   * (`pick` — POSTMORTEM 2026-09-08의 프로토타입 키 사고가 그 함수를 그렇게 만들었다).
   */
  const failure = e === undefined ? null : <AuthToast error={inviteErrorMessage(e)} />;

  /**
   * ⚠️ **노출을 단계로 가르는 것이 요지다** (account-linking §6): 이 화면은 matcher 밖이라 링크를
   * 가진 누구에게나 열리고, 그때 고를 것은 "로그인할까"뿐이라 **프로젝트 카드가 없다.**
   */
  if (session.status === "none") {
    return (
      <Card>
        <AuthHeading title={m.invite.title} description={m.invite.sentTo(email)} />
        {failure}
        <p className="text-muted-foreground text-center text-xs">{m.invite.signInHint(email)}</p>
        <div className="flex w-full flex-col gap-2">
          {/* 로그인 뒤 이 페이지로 돌아온다 — 토큰이 URL에 있으므로 그대로 이어진다. */}
          {/* ⚠️ **둘 다 `default`다** — 어느 쪽으로 가입했는지 화면이 모르므로 primary가 없다. */}
          <ProviderButton provider="github" label={m.invite.github} token={token} />
          <ProviderButton provider="google" label={m.invite.google} token={token} />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {/*
        ⚠️ **각주에서 설명으로 올라왔다** — 누구의 초대인지는 수락 버튼 뒤의 단서가 아니라 읽는
        순서의 둘째다 (account-linking §6).
      */}
      <AuthHeading title={m.invite.title} description={m.invite.sentTo(email)} />
      {/* 수락 버튼을 눌러서 나는 실패는 이 줄이 유일한 통로다 — 없으면 아무 일도 안 일어난 것으로 보인다. */}
      {failure}
      <InviteProjectCard
        name={invitation.project.name}
        role={m.projects.role[invitation.role]}
        locales={invitation.project.locales.map((locale) => locale.code)}
      />
      {/*
        "초대받은 주소의 계정으로 로그인해 주세요"라고 말해 놓고 로그아웃할 곳이 없으면 갇힌다 — 이
        페이지는 `(edit)` 레이아웃 밖이라 셸의 sign out이 없다 (code-review 2026-09-06 🟡11).
        로그아웃 뒤 같은 링크로 돌아온다.
      */}
      {/* CTA 덩어리 — 컬럼 16과 달리 안쪽은 8이다 (`AuthColumn` 주석). */}
      <div className="flex w-full flex-col gap-2">
      {e === "email-mismatch" && (
        <form
          className="w-full"
          action={async () => {
            "use server";
            await signOut({ redirectTo: routes.invite(token) });
          }}
        >
          <SubmitButton size="lg" className="w-full">
            {m.invite.otherAccount}
          </SubmitButton>
        </form>
      )}
      <form
        className="w-full"
        action={async () => {
          "use server";
          const result = await acceptInvitation({ token });
          // 실패 사유를 쿼리로 넘긴다 — 이 페이지가 다시 그리며 위 문구를 고른다.
          redirect(
            result.ok
              ? routes.project(result.slug)
              : `${routes.invite(token)}?e=${result.error}`,
          );
        }}
      >
        <SubmitButton variant="primary" size="lg" className="w-full">
          {m.invite.accept}
        </SubmitButton>
      </form>
      </div>
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

function ProviderButton({
  provider,
  label,
  token,
}: {
  provider: string;
  label: string;
  token: string;
}) {
  return (
    <form
      className="w-full"
      action={async () => {
        "use server";
        await clearRevocationCookies();
        await clearLinkCookies();
        await signIn(provider, { redirectTo: routes.invite(token) });
      }}
    >
      <SubmitButton size="lg" className="w-full">
        {label}
      </SubmitButton>
    </form>
  );
}

/** 행을 읽자마자 갈리는 셋 — 사용자가 할 수 있는 일이 없으므로 버튼을 두지 않는다. */
function Notice({ children, retryToken }: { children: ReactNode; retryToken?: string }) {
  return (
    <Card>
      <Alert variant="danger">{children}</Alert>
      {retryToken !== undefined && <form method="get" action={routes.invite(retryToken)}>
        <Button type="submit">{m.common.retry}</Button>
      </form>}
    </Card>
  );
}
