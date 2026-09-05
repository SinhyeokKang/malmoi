import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { hashInviteToken } from "@/lib/auth/invitation";
import { inviteErrorMessage, type InviteError } from "@/lib/auth/message";
import { getPrisma } from "@/lib/db";

import { acceptInvitation } from "../actions";

/**
 * 초대 수락 화면.
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

/** `sinhyeok@day1company.co.kr` → `s***@day1company.co.kr`. 제3자에게 남의 주소를 그대로 보이지 않는다. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

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
  const session = await auth();

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

  if (invitation === null) {
    return <Notice title="초대를 찾을 수 없어요." detail="링크가 잘못됐거나 취소된 초대예요." />;
  }
  if (invitation.acceptedAt !== null) {
    return <Notice title="이미 사용된 링크예요." detail="초대는 한 번만 쓸 수 있어요." />;
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    return <Notice title="초대가 만료됐어요." detail="초대한 분에게 새 링크를 요청해 주세요." />;
  }

  const label = `${invitation.project.name} · ${invitation.role === "OWNER" ? "소유자" : "편집자"}`;

  // ⚠️ **두 분기가 함께 쓴다.** `unauthorized`는 세션이 끊긴 뒤에 오므로 아래 로그인 화면에서만
  // 보이고, `email-mismatch`·`already-member`는 로그인한 화면에서만 온다 — 한쪽에만 두면
  // 그 사유의 문구가 도달할 수 없다.
  const failure = e === undefined ? null : <p className="text-destructive text-sm">{inviteErrorMessage(e as InviteError)}</p>;

  if (!session?.user) {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-8">
        <h1 className="text-lg font-semibold tracking-tight">말모이</h1>
        <p className="text-sm">{label}로 초대받았어요.</p>
        {failure}
        <p className="text-muted-foreground text-xs">
          {maskEmail(invitation.email)} 주소의 계정으로 로그인하면 수락할 수 있어요.
        </p>
        <div className="flex flex-col gap-2">
          {/* 로그인 뒤 이 페이지로 돌아온다 — 토큰이 URL에 있으므로 그대로 이어진다. */}
          <ProviderButton provider="github" label="GitHub으로 로그인" token={token} />
          <ProviderButton provider="google" label="Google로 로그인" token={token} />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-lg font-semibold tracking-tight">말모이</h1>
      <p className="text-sm">{label}로 초대받았어요.</p>
      {/* 수락 버튼을 눌러서 나는 실패는 이 줄이 유일한 통로다 — 없으면 아무 일도 안 일어난 것으로 보인다. */}
      {failure}
      <form
        action={async () => {
          "use server";
          const result = await acceptInvitation({ token });
          // 실패 사유를 쿼리로 넘긴다 — 이 페이지가 다시 그리며 위 문구를 고른다.
          redirect(result.ok ? `/projects/${result.slug}/translations` : `/invite/${token}?e=${result.error}`);
        }}
      >
        <button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring w-full rounded-md px-4 py-2 text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"
        >
          초대 수락
        </button>
      </form>
      <p className="text-muted-foreground text-xs">
        {maskEmail(invitation.email)} 주소로 온 초대예요. 다른 계정으로 로그인했다면 수락되지 않아요.
      </p>
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
        await signIn(provider, { redirectTo: `/invite/${token}` });
      }}
    >
      <button
        type="submit"
        className="border-input hover:bg-accent focus-visible:ring-ring w-full rounded-md border px-4 py-2 text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"
      >
        {label}
      </button>
    </form>
  );
}

function Notice({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-2 p-8">
      <p className="text-destructive text-sm">{title}</p>
      <p className="text-muted-foreground text-xs">{detail}</p>
    </main>
  );
}
