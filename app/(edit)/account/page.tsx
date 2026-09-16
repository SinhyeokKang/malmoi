import { connectOutcome, isUnlinkOutcome } from "@/lib/account-connect/plan";
import { decodeUser } from "@/lib/credentials/records";
import { AccountCard, AccountFacts } from "@/components/account/account-section";
import { DismissibleAlert } from "@/components/account/dismissible-alert";
import { GithubSection } from "@/components/account/github-section";
import { LoginMethods } from "@/components/account/login-methods";
import { ProfileNameForm } from "@/components/account/profile-name-form";
import { ProfilePicture } from "@/components/account/profile-picture";
import { SessionsSection } from "@/components/account/sessions-section";
import { signOut } from "@/auth";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { displayName } from "@/lib/account/plan";
import { getPrisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { loadAccountView } from "@/lib/github-connect/account-view";
import { installationSettingsUrl } from "@/lib/github-connect/installation-url";
import { loadInstalledRepoCount } from "@/lib/github-connect/installed-repos";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { linkErrorMessage, providerLabel } from "@/lib/login-link/message";
import { isLoginProvider, loginMethodRows, LOGIN_PROVIDERS, pickLoginAccount } from "@/lib/login-link/policy";
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
 * ⚠️ **머리 하나 + 리스트 셋이다** (2026-09-13). 그 전엔 `Card` 다섯이 `space-y-6`으로 평평하게
 * 쌓여 축이 안 보였고, **같은 화면에 "GitHub"이 세 군데** 나오는데 그 구별을 카드 설명문 두 줄에
 * 맡기고 있었다 — 설명문은 읽은 사람에게만 작동한다.
 *
 * ⚠️ **이름은 사용자 소유이고 이메일만 provider 소유다** (PRODUCT §4.1, 2026-09-13 판정).
 * 이메일을 고칠 수 없는 근거는 초대 대조가 **검증된 주소** 위에 선다는 것이고(ARCHITECTURE §6.02),
 * 그 논증은 이메일 축에서만 성립한다 — 이름은 멤버 목록·초대에서 **남이 나를 알아보는 이름**이라
 * provider의 표시 이름이 그 자리에 맞지 않을 수 있다.
 *
 * ⚠️ **"재로그인마다 `planEmailRefresh`가 이름을 갱신한다"가 여기 적혀 있었고 거짓이었다** —
 * 그 함수는 입력 넷이 전부 이메일이고 반환도 `keep | update | conflict`뿐이라 이름 축이 없다.
 * 이름을 덮을 수 있는 통로는 `lib/credentials/adapter.ts`의 `updateUser` 하나이고, **OAuth
 * 재로그인은 그 메서드를 부르지 않는다** — 그 계약을 `lib/credentials/__tests__`의 둘이 든다.
 */
export default async function AccountPage({ searchParams }: { searchParams: Promise<Raw<"e" | "sessionRevocation" | "link" | "connect">> }) {
  const { userId } = await requireUser();

  /**
   * 연결 왕복의 실패 사유가 여기로도 온다 (`dest: {kind:"account"}`). 읽는 쪽이 셋에서 **넷**이 됐다 —
   * 실어 보내놓고 안 읽으면 거부가 통째로 무음이고, 사용자에게는 버튼이 안 눌린 것으로 보인다
   * (POSTMORTEM 2026-09-06). **판정 함수로 거른다** — 주소창 값을 캐스팅하면 프로토타입 키가 문자열
   * 자리에 함수를 넣어 화면이 죽는다 (POSTMORTEM 2026-09-08).
   *
   * ⚠️ **넷이 같은 자리에 서지 않고, 가르는 축은 "구역"이 아니라 "다시 시도할 자리가 어디인가"다**
   * (2026-09-14 리뷰 🟢8에서 규칙을 고쳤다). `?e=`·`?link=`는 **머리**다 — 연결 왕복이 화면 밖에서
   * 깨졌거나(`e`) 마지막 수단이라 거절된 것(`link`)이고, 둘 다 그 구역의 컨트롤을 다시 눌러서는
   * 풀리지 않는다. `?connect=`·`?sessionRevocation=`은 **그 구역 안**이다 — 바로 옆 컨트롤을 다시
   * 누르는 것이 다음 행동이라 사유가 그 자리에 붙어 있어야 한다.
   *
   * ⚠️ **[Dismiss]도 같은 축을 따른다** — 머리 둘만 닫힌다. 구역 Alert를 치우면 다시 누를 컨트롤
   * 옆에서 사유만 사라진다.
   */
  const { e, sessionRevocation, link, connect } = firstQueryValues(await searchParams);
  const notice = isConnectError(e) ? connectErrorMessage(e) : null;
  /**
   * ⚠️ **보내는 쪽과 읽는 쪽이 같은 커밋에 있어야 한다** — 사유를 실어 보내놓고 아무도 안 읽으면
   * 사용자에게는 버튼이 안 눌린 것으로 보인다 (POSTMORTEM 2026-09-06). 성공은 화면이 바뀌는 것이
   * 피드백이라 문구를 내지 않는다 — 실패만 말한다.
   */
  const unlinkFailure = isUnlinkOutcome(link) && link !== "disconnected" ? linkErrorMessage(link) : null;

  const prisma = getPrisma();
  /**
   * ⚠️ **프로필을 세션이 아니라 `User` 행에서 읽는다.** 세션에도 이름·이메일이 있지만, 초대 대조가
   * 보는 값은 저장된 `User.email`이다 (ARCHITECTURE §6.02) — 이 화면이 보여야 하는 것은 그쪽이다.
   *
   * ⚠️ **넷이 독립적으로 실패한다** — 프로필은 우리 DB, GitHub 상태는 사용자 토큰이라 묶으면
   * GitHub 장애에 화면이 통째로 빈다 (설정 화면과 같은 판단, DESIGN §6.6).
   */
  const [storedProfile, account, methods, installedRepoCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, emailLookup: true, image: true } }),
    loadAccountView(prisma, userId),
    prisma.account.findMany({ where: { userId, provider: { in: [...LOGIN_PROVIDERS] } }, select: { provider: true } }),
    /**
     * ⚠️ **직렬로 붙이지 않는다.** 연결됨 갈래에서만 쓰이는 값이라 `loadAccountView` 뒤에 줄을
     * 세우고 싶어지는데, 그러면 가장 흔한 상태의 왕복이 하나 는다. 병렬이면 느는 것은 `Account`
     * 행 읽기 하나(같은 pooler)다. **두 조회가 `ensureUserToken`을 각각 부르는 것이 안전한
     * 이유는 `installed-repos.ts`의 주석에 있다** (design §2.1).
     */
    loadInstalledRepoCount(prisma, userId),
  ]);

  const profile = storedProfile === null ? null : decodeUser(storedProfile);
  const name = profile?.name ?? "";
  /**
   * 전체 로그아웃의 확인 상대는 **서버가 결정적으로 고른다** — 클라이언트가 고르게 하면 공격자가
   * 확인 상대를 고른다. 화면은 같은 판정을 다시 돌려 **이름만** 쓴다(확정 라벨이 결과를 말해야 한다).
   */
  const confirming = pickLoginAccount(methods);
  const confirmProvider = confirming !== null && isLoginProvider(confirming.provider) ? providerLabel(confirming.provider) : null;

  // Server Action을 클라이언트 컴포넌트에 **참조로** 넘긴다 — 셸의 로그아웃과 같은 형이다.
  // ⚠️ **`/`가 맞다 — 이관 누락이 아니다** (2026-09-10 사용자): 로그아웃은 랜딩으로 간다.
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <>
      {/*
        ⚠️ **머리와 본문이 형제다** — 머리는 고정, 본문만 스크롤한다 (`content-panel.tsx`).
        여백·폭 등급·머리 아래 선은 **프리미티브가 든다**(기본 등급이 `limited` = `max-w-4xl`) —
        화면이 다시 정하면 그 값이 두 번 적용된다.
      */}
      <PanelHeader>
        <h1 className="flex min-h-9 items-center text-lg font-medium">{m.common.nav.settings}</h1>
        {/*
          페이지 수준 거부는 **global Alert**이고 제목 **아래**다 (DESIGN §6.4).
          ⚠️ **머리에 있으므로 스크롤하지 않는다** — 거부 사유가 화면 밖으로 밀려나면 사용자는
          버튼이 안 눌린 것으로 본다 (POSTMORTEM 2026-09-06).
          ⚠️ **[Dismiss]가 붙는 자리는 여기뿐이다** — 위 판정 주석의 축 그대로다: 여기 서는 둘은
          **다시 시도할 컨트롤이 이 화면에 없다.** 구역 Alert는 바로 옆 컨트롤을 다시 누르는 것이
          다음 행동이라, 치우면 그 자리에서 사유만 사라진다. ⚠️ **"일회성이냐 현재 상태냐"로 가르지
          않는다** (2026-09-14) — `?connect=`도 왕복에서 돌아온 일회성 값인데 구역에 선다.
        */}
        {/*
          ⚠️ **머리에 남는 것은 `?e=` 하나다** (2026-09-16). `?link=`는 수단 카드 안으로 내려갔다 —
          다시 누를 행이 그 카드에 있으므로 축("다시 시도할 컨트롤이 이 화면에 있는가")이 그쪽을
          가리킨다. 둘이 쌓일 수 있던 동안에는 무엇이 실패했는지에 따라 **머리 높이가 달라졌다.**
          ⚠️ `?e=`에는 `href`를 주지 않는다 — 하드 내비게이션으로만 오므로 지역 상태로 충분하다.
        */}
        {notice !== null && <DismissibleAlert>{notice}</DismissibleAlert>}
      </PanelHeader>

      {/*
        ⚠️ **간격이 16 하나다** (2026-09-16 — 전엔 구역 28 · 제목↔리스트 12). 제목이 카드 안으로
        들어간 뒤로는 **카드 자체가 축**이라 간격이 하나면 되고, 리듬이 Project Home과 같아진다.
      */}
      <PanelBody className="space-y-4">
        {/*
          ⚠️ **Profile이 카드가 됐다** — 전엔 패널 머리에 붙은 블록이라 카드 셋과 형이 달랐다.
          아바타 행만 두 열을 가로지른다: 아바타와 버튼 사이 간격(16)이 라벨 열 폭과 무관해야 한다.
        */}
        <AccountCard title={m.account.profile.title}>
          <AccountFacts>
          <div className="col-span-2 flex items-center gap-4">
            {/* ⚠️ **셸의 32와 같은 판정·같은 입력이다** — 한쪽만 사진이면 같은 계정이 두 얼굴이 된다. */}
            <Avatar name={displayName(profile?.name, profile?.email)} src={profile?.image} size={56} />
            <ProfilePicture hasPicture={(profile?.image ?? null) !== null} />
          </div>

          <label className="text-xs text-neutral-400" htmlFor="account-name">{m.account.profile.name}</label>
          <ProfileNameForm name={name} inputId="account-name" />

          <label className="text-xs text-neutral-400" htmlFor="account-email">{m.account.profile.email}</label>
          <div className="flex items-center gap-3">
            {/*
              ⚠️ **`disabled`가 아니라 `readOnly`다** — disabled 필드는 접근성 트리에서 빠져
              스크린리더가 자기 주소를 못 읽는다. 키보드 순서에서만 뺀다.
              ⚠️ **글자가 기본색이다** — muted 면 위의 muted 글자는 14px에서 4.35:1로 하한을 깬다.
              ⚠️ **자기 주소라 마스킹하지 않는다** — 남의 주소를 보이는 자리만 `maskEmail`을 지난다.
            */}
            <Input
              id="account-email"
              value={profile?.email ?? m.account.profile.none}
              readOnly
              tabIndex={-1}
              className="bg-muted w-80 cursor-default"
            />
            <p className="text-muted-foreground text-xs">{m.account.profile.emailSource}</p>
          </div>
          </AccountFacts>
        </AccountCard>

        {/*
          ⚠️ **같은 화면에 "GitHub"이 세 군데 나온다** — 로그인 수단 · 리포 쓰기 권한 · 전체
          로그아웃의 확인 상대다. 구역 제목이 그 축을 말하는 것이 이 재편의 요지다.
        */}
        <LoginMethods outcome={connectOutcome(connect)} rows={loginMethodRows(methods)} unlinkFailure={unlinkFailure} />

        <GithubSection
          account={account}
          installedRepoCount={installedRepoCount}
          settingsUrl={installationSettingsUrl(optionalEnv("GITHUB_APP_SLUG"))}
        />

        <SessionsSection outcome={sessionRevocation} signOut={signOutAction} confirmProvider={confirmProvider} />
      </PanelBody>
    </>
  );
}
