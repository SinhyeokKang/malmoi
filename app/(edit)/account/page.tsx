import { decodeUser } from "@/lib/credentials/records";
import { LoginMethods } from "@/components/account/login-methods";
import { SessionRevocation } from "@/components/session-revocation";
import { signOut } from "@/auth";
import { DisconnectGithubButton } from "@/components/github-account";
import { ConnectGithubButton } from "@/components/onboarding/connect-github";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { loadAccountView } from "@/lib/github-connect/account-view";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { linkErrorMessage } from "@/lib/login-link/message";
import { loginMethodRows, LOGIN_PROVIDERS } from "@/lib/login-link/policy";
import { firstQueryValues, type Raw } from "@/lib/search-params";

/**
 * 계정 화면 — **사용자 축의 유일한 자리** (PRODUCT §7.7, 6b-4).
 *
 * ⚠️ **`requireUser`만 지난다 — 인가할 프로젝트가 없다.** 이 화면이 존재하는 이유가 정확히 그것이다:
 * 연결 해제 버튼이 `/projects` 목록에 얹혀 있었는데(2026-09-07 리뷰 🟡9) 그건 목록 화면의 일이 아니고,
 * 프로젝트를 하나도 안 만든 사용자에게 도달 가능한 자리가 그것뿐이었기 때문에 그렇게 됐다.
 *
 * ⚠️ **`middleware.ts`의 matcher에 `/account`를 따로 넣어야 했다** — 패턴이 `/projects/:path*` 하나라
 * 사용자 축은 1차 차단 밖에서 태어난다 (`entry-points.test.ts`가 그것을 센다).
 *
 * ⚠️ **프로필은 읽기 전용이다.** 이름·이메일은 provider가 소유하고 재로그인마다 `planEmailRefresh`가
 * 갱신한다 — 고칠 수 있게 하면 초대 대조(ARCHITECTURE §6.02)가 검증되지 않은 주소 위에 선다.
 */
export default async function AccountPage({ searchParams }: { searchParams: Promise<Raw<"e" | "sessionRevocation" | "link">> }) {
  const { userId } = await requireUser();

  /**
   * 연결 왕복의 실패 사유가 여기로도 온다 (`dest: {kind:"account"}`). 읽는 쪽이 셋에서 **넷**이 됐다 —
   * 실어 보내놓고 안 읽으면 거부가 통째로 무음이고, 사용자에게는 버튼이 안 눌린 것으로 보인다
   * (POSTMORTEM 2026-09-06). **판정 함수로 거른다** — 주소창 값을 캐스팅하면 프로토타입 키가 문자열
   * 자리에 함수를 넣어 화면이 죽는다 (POSTMORTEM 2026-09-08).
   */
  const { e, sessionRevocation, link } = firstQueryValues(await searchParams);
  const notice = isConnectError(e) ? connectErrorMessage(e) : null;
  /**
   * ⚠️ **보내는 쪽과 읽는 쪽이 같은 커밋에 있어야 한다** — 사유를 실어 보내놓고 아무도 안 읽으면
   * 사용자에게는 버튼이 안 눌린 것으로 보인다 (POSTMORTEM 2026-09-06). 성공은 카드가 바뀌는 것이
   * 피드백이라 문구를 내지 않는다 — 실패만 말한다.
   */
  const unlinkFailure = link === undefined || link === "disconnected" ? null : linkErrorMessage(link);

  const prisma = getPrisma();
  /**
   * ⚠️ **프로필을 세션이 아니라 `User` 행에서 읽는다.** 세션에도 이름·이메일이 있지만, 초대 대조가
   * 보는 값은 저장된 `User.email`이다 (ARCHITECTURE §6.02) — 이 화면이 보여야 하는 것은 그쪽이다.
   *
   * ⚠️ **두 블록이 독립적으로 실패한다** — 프로필은 우리 DB, GitHub 상태는 사용자 토큰이라 묶으면
   * GitHub 장애에 화면이 통째로 빈다 (설정 화면과 같은 판단, DESIGN §6.6).
   */
  const [storedProfile, account, methods] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, emailLookup: true, image: true } }),
    loadAccountView(prisma, userId),
    prisma.account.findMany({ where: { userId, provider: { in: [...LOGIN_PROVIDERS] } }, select: { provider: true } }),
  ]);

  const profile = storedProfile === null ? null : decodeUser(storedProfile);

  // Server Action을 클라이언트 컴포넌트가 아니라 폼에 직접 넘긴다 — 셸의 로그아웃과 같은 형이다.
  // ⚠️ **`/`가 맞다 — 이관 누락이 아니다** (2026-09-10 사용자): 로그아웃은 랜딩으로 간다.
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <>
      {/*
        ⚠️ **머리와 본문이 형제다** — 머리는 고정, 본문만 스크롤한다 (`content-panel.tsx`).
        `max-w-4xl`은 **안쪽 래퍼**가 든다: `PanelBody`에 직접 주면 스크롤 컨테이너가 좁아져
        스크롤바가 패널 가장자리가 아니라 콘텐츠 옆에 생긴다.
      */}
      <PanelHeader>
        <div className="mx-auto w-full max-w-4xl space-y-3 px-6 pt-6 pb-3">
          {/*
            페이지 수준 거부는 **global Alert**다 (DESIGN §6.4).
            ⚠️ **머리에 있으므로 스크롤하지 않는다** — 거부 사유가 화면 밖으로 밀려나면 사용자는
            버튼이 안 눌린 것으로 본다 (POSTMORTEM 2026-09-06).
          */}
          {notice !== null && <Alert variant="danger">{notice}</Alert>}
          {unlinkFailure !== null && <Alert variant="danger">{unlinkFailure}</Alert>}
          <h1 className="flex min-h-9 items-center text-xl font-medium">{m.common.nav.settings}</h1>
        </div>
      </PanelHeader>

      <PanelBody>
        <div className="mx-auto w-full max-w-4xl space-y-6 px-6 pt-3 pb-8">
          <Card title={m.account.profile.title} description={m.account.profile.description}>
            <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted-foreground text-xs">{m.account.profile.name}</dt>
              <dd>{profile?.name ?? m.account.profile.none}</dd>
              <dt className="text-muted-foreground text-xs">{m.account.profile.email}</dt>
              {/* 주소는 식별자라 mono다 (DESIGN §4.1). **자기 주소라 마스킹하지 않는다** */}
              <dd className="text-mono">{profile?.email ?? m.account.profile.none}</dd>
            </dl>
          </Card>

          {/*
            ⚠️ **같은 화면에 "GitHub"이 두 번 나온다** — 위는 **로그인 수단**, 아래는 **리포 쓰기
            권한**(GitHub App 연결)이다. 다른 축이고 그 구별이 화면에서 보여야 한다.
            ⚠️ **[Connect]가 없다** (design ⑨) — 붙이는 문은 `finishLink` 하나뿐이다.
          */}
          <Card title={m.link.methods.title} description={m.link.methods.description}>
            <LoginMethods rows={loginMethodRows(methods)} />
          </Card>

          <Card title={m.settings.account.title} description={m.account.github.description}>
            {account.status === "reauthorize" ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">{m.settings.account.reauthorize}</p>
                {/* 자동 redirect가 아니라 버튼이다 — 렌더 중 튕기면 callback 실패 시 루프다 */}
                <ConnectGithubButton dest="account" label={m.settings.account.reconnect} />
              </div>
            ) : account.status === "unavailable" ? (
              <p className="text-muted-foreground text-xs">{m.settings.account.unavailable}</p>
            ) : account.login === null ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">{m.account.github.notConnected}</p>
                <ConnectGithubButton dest="account" label={m.settings.account.connect} />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {/* GitHub 핸들은 식별자라 mono다 (DESIGN §4.1) */}
                <span className="text-mono bg-muted rounded px-2 py-1">@{account.login}</span>
                <DisconnectGithubButton />
              </div>
            )}
          </Card>

          <Card title={m.account.sessions.title} description={m.account.sessions.description}>
            <SessionRevocation outcome={sessionRevocation} />
          </Card>

          <Card title={m.account.signOut.title} description={m.account.signOut.description}>
            <form action={signOutAction}>
              <Button type="submit" size="sm">
                {m.common.nav.signOut}
              </Button>
            </form>
          </Card>
        </div>
      </PanelBody>
    </>
  );
}
