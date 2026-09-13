"use client";

import { Link2 } from "lucide-react";
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
  const connected = account.status === "ok" && account.login !== null;

  return (
    <AccountSection
      title={m.settings.account.title}
      subtitle={m.account.github.description}
      notice={failure !== null ? <Alert variant="danger">{failure}</Alert> : undefined}
    >
      {/*
        ⚠️ **브랜드 마크는 연결됐을 때뿐이다** — 붙어 있는 것이 그 계정이기 때문이다. 미연결·장애는
        대상이 아직 없으므로 동작을 가리키는 lucide 글리프(`link-2`, 회색)가 선다.
      */}
      <AccountRow
        glyph={connected ? <GithubIcon className="size-4" /> : <Link2 className="text-muted-foreground size-4" aria-hidden />}
        name={connected ? `@${account.login}` : m.account.github.rowName}
        detail={
          account.status === "reauthorize" ? m.settings.account.reauthorize
          : account.status === "unavailable" ? m.settings.account.unavailable
          : !connected ? m.account.github.notConnected
          // 누르기 전에 이미 보이는 숫자다 — Dialog가 새 정보를 들이밀지 않는다.
          : m.account.github.connected(usage)
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
          <DisconnectGithubButton usage={usage} onFailure={setFailure} />
        ) : account.status === "ok" ? (
          <ConnectGithubButton dest="account" label={m.settings.account.connect} onResult={setFailure} />
        ) : undefined}
      </AccountRow>
    </AccountSection>
  );
}
