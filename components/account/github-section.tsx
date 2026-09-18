"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";

import { AccountCard, AccountRow, AccountRows } from "@/components/account/account-section";
import { DisconnectGithubButton } from "@/components/github-account";
import { ConnectGithubButton } from "@/components/onboarding/connect-github";
import { GithubIcon } from "@/components/signin/brand-icons";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import type { AccountView } from "@/lib/github-connect/account-view";
import { m } from "@/lib/i18n";

/**
 * GitHub account 구역 — **리포 쓰기 권한이고 로그인 수단이 아니다** (account-settings 태스크 4).
 *
 * ⚠️ **같은 화면에 "GitHub"이 세 번 나온다** — 로그인 수단 · 이 연결 · 전체 로그아웃의 확인 상대다.
 * 전에는 그 구별을 **카드 설명문 두 줄**에 맡겼는데 설명문은 읽은 사람에게만 작동한다. 지금은
 * 구역 제목이 축을 말하고 항목이 대상을 말한다.
 *
 * ⚠️ **해제 실패가 구역 Alert로 올라온다** — 이 버튼은 리스트 항목의 우측 컨트롤이라 형제로 두면
 * 버튼 옆에 서서 행이 무너진다 (`DisconnectGithubButton`의 `onFailure`).
 */
export function GithubSection({
  account,
  installedRepoCount,
  settingsUrl,
}: {
  account: AccountView;
  /**
   * `null`이면 **말할 수 없다**(조회 실패)이고, `0`이면 고른 리포가 없다. 둘 다 보조 줄을 안
   * 그린다 — 화면에서 갈리지 않지만 판정은 갈려 있어야 `logFailure`가 원인을 남긴다.
   */
  installedRepoCount: number | null;
  /** `GITHUB_APP_SLUG`가 없으면 `null`이고 그 링크만 조용히 사라진다. */
  settingsUrl: string | null;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  const connected = account.status === "ok" && account.login !== null;

  return (
    <AccountCard
      title={m.account.github.title}
      subtitle={m.account.github.description}
      notice={failure !== null ? <Alert variant="danger">{failure}</Alert> : undefined}
    >
      <AccountRows>
      {/*
        ⚠️ **브랜드 마크는 연결됐을 때뿐이다** — 붙어 있는 것이 그 계정이기 때문이다. 미연결·장애는
        대상이 아직 없으므로 동작을 가리키는 lucide 글리프(`link-2`, 회색)가 선다.
      */}
      <AccountRow
        glyph={connected ? <GithubIcon className="size-4" /> : <Link2 className="text-muted-foreground size-4" aria-hidden />}
        name={connected ? `@${account.login}` : m.account.github.rowName}
        // 상태가 본문이고 보조 줄은 **다음에 할 일**을 든다 (핸드오프 v2 §항목 규격).
        status={
          account.status === "reauthorize" ? m.account.github.statusReauthorize
          : account.status === "unavailable" ? m.account.github.statusUnavailable
          : connected ? m.account.github.connected
          : m.account.github.notConnected
        }
        detail={
          account.status === "reauthorize" ? m.account.github.hintReauthorize
          : account.status === "unavailable" ? m.account.github.hintUnavailable
          : !connected ? m.account.github.hintNotConnected
          // ⚠️ **`null`(못 읽었다)과 `0`(고른 것이 없다)은 둘 다 줄을 안 그린다** — `Installed on 0
          // repositories.`는 연결이 깨진 것처럼 읽히고 행 높이만 갈린다 (design §8 결정 3).
          : installedRepoCount !== null && installedRepoCount > 0
            ? m.account.github.installedOn(installedRepoCount)
            : undefined
        }
      >
        {/*
          ⚠️ **`unavailable`에만 컨트롤이 없다.** 조회가 실패한 상태에서 [Connect]를 세우면 이미
          연결된 사용자에게 왕복을 한 번 더 시킨다 — 그 자리의 재시도는 페이지 새로고침이다.
          `reauthorize`는 장애가 아니라 **인가가 만료된 것**이라 다시 연결할 문이 필요하다.
          ⚠️ **실패 문구를 셋 다 구역 Alert로 올린다** (`onResult`·`onFailure`) — 여기는 리스트
          항목의 우측 컨트롤이고 그 클러스터가 `shrink-0`이라, Alert를 형제로 두면 행이 밀려난다.
        */}
        {account.status === "reauthorize" ? (
          // 자동 redirect가 아니라 버튼이다 — 렌더 중 튕기면 callback 실패 시 루프다.
          <ConnectGithubButton dest="account" label={m.settings.account.reconnect} onResult={setFailure} />
        ) : connected ? (
          <>
            {/*
              ⚠️ **연결됨에만 선다** (design §3.6). 나머지 셋은 설치를 못 믿는 상태이고, 그때 밖으로
              나가는 문을 두면 사용자가 "고치러 갔는데 고칠 게 없는" 자리에 착지한다.
              ⚠️ **나가는 것이 왼쪽, 파괴적인 것이 오른쪽 끝이다** — 세션 구역과 같은 순서다.
              ⚠️ **`ButtonLink`가 아니라 `<a>`다** — 그 프리미티브는 `next/link`라 `target`·`rel`을
              안 받는다. 프리미티브를 넓히는 대신 `publish-button.tsx`가 이미 쓰는 형을 따른다
              (POSTMORTEM 2026-09-15 🔁 — 형제 프리미티브를 건드리면 소비자를 따로 세야 한다).
            */}
            {settingsUrl !== null && (
              <a className={buttonClass()} href={settingsUrl} target="_blank" rel="noreferrer">
                {m.account.github.installationSettings}
              </a>
            )}
            <DisconnectGithubButton onFailure={setFailure} />
          </>
        ) : account.status === "ok" ? (
          <ConnectGithubButton dest="account" label={m.settings.account.connect} onResult={setFailure} />
        ) : undefined}
      </AccountRow>
      </AccountRows>
    </AccountCard>
  );
}
