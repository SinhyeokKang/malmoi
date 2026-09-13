"use client";

import { useState } from "react";

import { AccountRow, AccountSection } from "@/components/account/account-section";
import { DisconnectGithubButton } from "@/components/github-account";
import { ConnectGithubButton } from "@/components/onboarding/connect-github";
import { GithubIcon } from "@/components/signin/brand-icons";
import { Alert } from "@/components/ui/alert";
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
export function GithubSection({ account, usage }: { account: AccountView; usage: number | null }) {
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <AccountSection
      title={m.settings.account.title}
      subtitle={m.account.github.description}
      notice={failure !== null ? <Alert variant="danger">{failure}</Alert> : undefined}
    >
      <AccountRow
        glyph={<GithubIcon className="size-4" />}
        name={account.status === "ok" && account.login !== null ? `@${account.login}` : m.account.github.rowName}
        detail={
          account.status === "reauthorize" ? m.settings.account.reauthorize
          : account.status === "unavailable" ? m.settings.account.unavailable
          : account.login === null ? m.account.github.notConnected
          : undefined
        }
      >
        {/*
          ⚠️ **장애일 때는 컨트롤을 주지 않는다** — 연결 상태를 모르는 채로 [Connect]를 세우면
          이미 연결된 사용자에게 왕복을 한 번 더 시킨다. 사유는 보조 문구가 든다.
        */}
        {account.status === "reauthorize" ? (
          // 자동 redirect가 아니라 버튼이다 — 렌더 중 튕기면 callback 실패 시 루프다.
          <ConnectGithubButton dest="account" label={m.settings.account.reconnect} />
        ) : account.status === "ok" && account.login === null ? (
          <ConnectGithubButton dest="account" label={m.settings.account.connect} />
        ) : account.status === "ok" ? (
          <DisconnectGithubButton usage={usage} onFailure={setFailure} />
        ) : undefined}
      </AccountRow>
    </AccountSection>
  );
}
