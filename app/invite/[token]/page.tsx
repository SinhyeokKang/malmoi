import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { signIn, signOut } from "@/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { maskEmail } from "@/lib/auth/email";
import { hashInviteToken } from "@/lib/auth/invitation";
import { inviteErrorMessage } from "@/lib/auth/message";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

import { acceptInvitation } from "../actions";

/**
 * 초대 수락 화면 — **셸 밖 카드다** (design §3.14 · DESIGN §5.1).
 *
 * ⚠️ **미들웨어 matcher 밖이다** (design §4.1). 비로그인으로 열려야 토큰이 보존된다 — matcher에
 * 넣으면 세션 없는 요청이 `/`로 302되고 그 순간 링크의 토큰이 사라진다.
 *
 * ⚠️ **비로그인에게 보이는 것은 마스킹한 이메일·프로젝트 이름·역할뿐이다.** 조건부 렌더이지만
 * 새는 데이터가 그것이 전부라 허용한다 — 번역 데이터는 이 페이지가 조회하지 않는다.
 *
 * ⚠️ **실패가 두 층에서 온다.** 행을 읽자마자 갈리는 셋(`not-found`·`already-accepted`·`expired`)은
 * 아래 `Notice`가 각자 내고, **수락 버튼을 눌러서 나는 셋**(`email-mismatch`·`already-member`·
 * `unauthorized`)은 `?e=`로 돌아와 `inviteErrorMessage`가 낸다. 여섯을 각자 다른 한 줄로 보이는 것이
 * 이 화면의 요지다 — 판정을 갈라놓고 화면을 안 갈라놓으면 사용자가 왜 실패했는지 모른다.
 */

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  // ⚠️ **이 인자를 빠뜨리면 아래 `redirect`가 넘기는 사유가 통째로 사라진다** — 주소창만 바뀌고
  // 화면은 그대로라, 사용자에게는 버튼이 안 눌린 것으로 보인다 (issue #2, POSTMORTEM 2026-09-06).
  searchParams: Promise<{ e?: string }>;
}) {
  const { token } = await params;
  const { e } = await searchParams;
  const session = await readSession();
  // 세션을 못 읽었으면 초대 행도 못 읽는다(같은 DB) — 비로그인 화면으로 접지 않고 장애라고 말한다.
  if (session.status === "unavailable") return <Notice>{m.errors.invite.unavailable}</Notice>;

  const invitation = await getPrisma().projectInvitation.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      project: { select: { name: true } },
    },
  });

  if (invitation === null) return <Notice>{m.errors.invite["not-found"]}</Notice>;
  if (invitation.acceptedAt !== null) return <Notice>{m.errors.invite["already-accepted"]}</Notice>;
  if (invitation.expiresAt.getTime() <= Date.now()) return <Notice>{m.errors.invite.expired}</Notice>;

  // 역할 이름은 `projects.role`에서 온다 — 화면 어휘가 두 벌이면 같은 역할이 화면마다 다르게 읽힌다.
  const invited = m.invite.invitedTo(invitation.project.name, m.projects.role[invitation.role]);
  const email = maskEmail(invitation.email);

  /**
   * ⚠️ **두 분기가 함께 쓴다.** `unauthorized`는 세션이 끊긴 뒤에 오므로 아래 로그인 화면에서만
   * 보이고, `email-mismatch`·`already-member`는 로그인한 화면에서만 온다 — 한쪽에만 두면
   * 그 사유의 문구가 도달할 수 없다.
   *
   * ⚠️ **주소창 값을 단언하지 않는다** — `inviteErrorMessage`가 모르는 값에 폴백 문구를 낸다
   * (`pick` — POSTMORTEM 2026-09-08의 프로토타입 키 사고가 그 함수를 그렇게 만들었다).
   */
  const failure = e === undefined ? null : <Alert variant="danger">{inviteErrorMessage(e)}</Alert>;

  if (session.status === "none") {
    return (
      <Card>
        <p className="text-sm">{invited}</p>
        {failure}
        <p className="text-muted-foreground text-xs">{m.invite.signInHint(email)}</p>
        <div className="flex flex-col gap-2">
          {/* 로그인 뒤 이 페이지로 돌아온다 — 토큰이 URL에 있으므로 그대로 이어진다. */}
          <ProviderButton provider="github" label={m.invite.github} token={token} />
          <ProviderButton provider="google" label={m.invite.google} token={token} />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-sm">{invited}</p>
      {/* 수락 버튼을 눌러서 나는 실패는 이 줄이 유일한 통로다 — 없으면 아무 일도 안 일어난 것으로 보인다. */}
      {failure}
      {/*
        "초대받은 주소의 계정으로 로그인해 주세요"라고 말해 놓고 로그아웃할 곳이 없으면 갇힌다 — 이
        페이지는 `(edit)` 레이아웃 밖이라 셸의 sign out이 없다 (code-review 2026-09-06 🟡11).
        로그아웃 뒤 같은 링크로 돌아온다.
      */}
      {e === "email-mismatch" && (
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: routes.invite(token) });
          }}
        >
          <Button type="submit" className="w-full">
            {m.invite.otherAccount}
          </Button>
        </form>
      )}
      <form
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
        <Button type="submit" variant="primary" className="w-full">
          {m.invite.accept}
        </Button>
      </form>
      <p className="text-muted-foreground text-xs">{m.invite.sentTo(email)}</p>
    </Card>
  );
}

/** 셸 밖 카드 — 로그인 화면과 같은 형이다 (DESIGN §5.1: `mx-auto max-w-sm`). */
function Card({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-lg font-semibold tracking-tight">{m.common.appName}</h1>
      {children}
    </main>
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
      action={async () => {
        "use server";
        await signIn(provider, { redirectTo: routes.invite(token) });
      }}
    >
      <Button type="submit" className="w-full">
        {label}
      </Button>
    </form>
  );
}

/** 행을 읽자마자 갈리는 셋 — 사용자가 할 수 있는 일이 없으므로 버튼을 두지 않는다. */
function Notice({ children }: { children: ReactNode }) {
  return (
    <Card>
      <Alert variant="danger">{children}</Alert>
    </Card>
  );
}
