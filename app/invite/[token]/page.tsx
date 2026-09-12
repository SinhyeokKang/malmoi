import { clearLinkCookies } from "@/lib/login-link/clear-cookies";
import { clearRevocationCookies } from "@/lib/session-revocation/clear-cookies";
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
import { AuthToast } from "@/components/signin/auth-toast";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { maskEmail } from "@/lib/auth/email";
import { hashInviteToken, planInvitationAccept } from "@/lib/auth/invitation";
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
 * - **Layer B** — 수락 버튼을 눌러서 나는 둘(`already-member`·`unauthorized`)은 `?e=`로 돌아와
 *   **토스트**가 낸다. 전역 결과를 내는 이벤트이고, 그 뒤에도 화면은 그대로 쓸 수 있다.
 * - **`email-mismatch`는 셋째 표면이다** (2026-09-12 사용자) — **버튼을 누르기 전에 렌더에서**
 *   판정해 **인라인 `Alert`**로 낸다. 병합 화면(`/signin/link/[challenge]`)과 같은 형이고 근거도
 *   같다: 메시지와 **조치가 한 자리에** 있어야 한다. 그 상태에서는 수락 버튼이 아예 없고
 *   [Sign in with another account] 하나만 남는다 — 눌러도 확실히 거부되는 버튼을 남기면 사용자가
 *   그것부터 누른다.
 *
 * 일곱을 각자 다른 한 줄로 보이는 것이 이 화면의 요지다 — 판정을 갈라놓고 화면을 안 갈라놓으면
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
   * ⚠️ **수락을 누르기 전에 대조한다** (2026-09-12 사용자 — 병합 화면과 같은 패턴). 전에는
   * `email-mismatch`가 **버튼을 눌러야** 나왔고 토스트로 떴다: provider에서 돌아온 사람이 겉보기에
   * 멀쩡한 카드를 보고 수락을 눌러야 비로소 "그 계정이 아니다"를 들었다.
   *
   * ⚠️ **판정을 다시 적지 않는다 — `planInvitationAccept` 그 함수를 부른다.** 여기서 `===`를 손으로
   * 쓰면 정규화 규칙이 두 벌이 되고 그중 하나가 낡으면 **화면과 서버가 다른 답을 낸다.**
   *
   * ⚠️ **`User` 행을 읽는다 — 세션의 `email`을 쓰지 않는다.** `acceptInvitation`이 읽는 값과 같은
   * 출처여야 두 판정이 갈리지 않는다(그 Action의 주석이 같은 이유를 적는다).
   */
  const viewer =
    session.status === "ok"
      ? await credentialIO(async () => {
          const row = await getPrisma().user.findUnique({
            where: { id: session.userId },
            select: { id: true, email: true, emailLookup: true },
          });
          return row === null ? null : decodeUser(row);
        }).catch(() => undefined)
      : null;
  if (viewer === undefined) return <Notice retryToken={token}>{m.errors.invite.unavailable}</Notice>;
  const mismatch =
    viewer !== null &&
    planInvitationAccept({ invitation, verifiedEmail: viewer.email, now: new Date() }) === "email-mismatch";

  /**
   * ⚠️ **두 분기가 함께 쓴다.** `unauthorized`는 세션이 끊긴 뒤에 오므로 아래 로그인 화면에서만
   * 보이고, `email-mismatch`·`already-member`는 로그인한 화면에서만 온다 — 한쪽에만 두면
   * 그 사유의 문구가 도달할 수 없다.
   *
   * ⚠️ **주소창 값을 단언하지 않는다** — `inviteErrorMessage`가 모르는 값에 폴백 문구를 낸다
   * (`pick` — POSTMORTEM 2026-09-08의 프로토타입 키 사고가 그 함수를 그렇게 만들었다).
   */
  /**
   * ⚠️ **`email-mismatch`가 여기서 빠졌다** — 그 사유는 이제 렌더에서 판정돼 **인라인**으로 뜬다
   * (아래). 둘 다 두면 같은 사건이 토스트와 Alert로 두 번 말해진다.
   */
  const failure = e === undefined || e === "email-mismatch" ? null : <AuthToast error={inviteErrorMessage(e)} />;

  /**
   * ⚠️ **노출을 단계로 가르는 것이 요지다** (account-linking §6): 이 화면은 matcher 밖이라 링크를
   * 가진 누구에게나 열리고, 그때 고를 것은 "로그인할까"뿐이라 **프로젝트 카드가 없다.**
   */
  if (session.status === "none") {
    return (
      <Card>
        <AuthHeading title={m.invite.title} description={m.invite.sentTo(email)} />
        {failure}
        <div className="flex w-full flex-col gap-2">
          {/* 로그인 뒤 이 페이지로 돌아온다 — 토큰이 URL에 있으므로 그대로 이어진다. */}
          {/* ⚠️ **`/signin`과 같은 버튼이다** — variant·아이콘·문구가 전부 그쪽을 따른다 (아래 주석). */}
          <ProviderButton provider="github" token={token} />
          <ProviderButton provider="google" token={token} />
          {/*
            ⚠️ **버튼 아래 캡션이다** (2026-09-12 사용자) — 위에 두면 조건이 먼저 오고 행동이 뒤에 와서
            읽는 순서가 "무엇을 하면 되나"보다 "무엇이 안 되나"로 시작한다. `/signin`의 약관 줄과
            병합 화면의 각주가 이미 그 자리다: **CTA 덩어리의 마지막 줄**.
          */}
          <p className="text-muted-foreground text-center text-xs leading-relaxed">
            {m.invite.signInHint(email)}
          </p>
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
      {/* 수락 버튼을 눌러서 나는 나머지 실패는 이 줄이 유일한 통로다 — 없으면 아무 일도 안 일어난 것으로 보인다. */}
      {failure}
      {/*
        ⚠️ **인라인이고 자리가 설명 아래·카드 위다** — 병합 화면(`/signin/link/[challenge]`)과 같은
        형이다: 메시지와 **조치가 한 자리에** 있어야 하고, 다시 누를 버튼이 바로 아래에 있다.
        토스트는 그 둘을 화면의 반대 끝으로 가른다 (규약 8의 의도적 예외, DESIGN §6.25).
      */}
      {mismatch && (
        <Alert variant="danger" className="w-full">
          {m.errors.invite["email-mismatch"]}
        </Alert>
      )}
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
      {/*
        CTA 덩어리 — 컬럼 16과 달리 안쪽은 8이다 (`AuthColumn` 주석).

        ⚠️ **불일치면 수락 버튼이 없다** — 눌러도 확실히 거부되는 버튼을 남기면 사용자가 그것부터
        누른다. 병합 화면이 채움 버튼 하나만 두는 것과 같은 판단: **앞으로 가는 길이 하나여야 한다.**
      */}
      <div className="flex w-full flex-col gap-2">
      {mismatch ? (
        <form
          className="w-full"
          action={async () => {
            "use server";
            await signOut({ redirectTo: routes.invite(token) });
          }}
        >
          <SubmitButton variant="primary" size="lg" className="w-full">
            {m.invite.otherAccount}
          </SubmitButton>
        </form>
      ) : (
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
      )}
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
        await clearRevocationCookies();
        await clearLinkCookies();
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
