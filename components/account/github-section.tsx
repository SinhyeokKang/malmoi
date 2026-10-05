"use client";
import { StatusBadge } from "@/components/ui/status-badge";
import { IconTile } from "@/components/ui/icon-tile";

import { Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ListRow } from "@/components/ui/list-row";
import { Card, CardRows } from "@/components/ui/card";
import { DisconnectGithubButton } from "@/components/github-account";
import { ConnectGithubButton } from "@/components/onboarding/connect-github";
import { GithubIcon } from "@/components/signin/brand-icons";
import { Alert } from "@/components/ui/alert";
import { landFocus } from "@/components/ui/focus";
import { ButtonLink } from "@/components/ui/button";
import type { AccountView } from "@/lib/github-connect/account-view";
import { useMessages } from "@/components/i18n/messages-provider";

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
  const m = useMessages();
  const [failure, setFailure] = useState<string | null>(null);
  const connected = account.status === "ok" && account.login !== null;
  /**
   * ⚠️ **해제가 성공하면 누른 [Disconnect]가 행과 함께 바뀐다** (audit #32) — 포커스가 `body`로 빠졌다. 버튼은 그 순간
   * 언마운트되어 자기 착지를 못 하므로, 남는 이 구역이 연결 상태의 전이를 보고 같은 행의 새 컨트롤로 옮긴다.
   * ⚠️ 래퍼가 `contents`라 행의 flex 배치는 그대로다.
   */
  const controls = useRef<HTMLDivElement>(null);
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (wasConnected.current && !connected) landFocus(controls.current?.querySelector<HTMLElement>("button, a[href]"));
    wasConnected.current = connected;
  }, [connected]);

  return (
    <Card
      title={m.account.github.title}
      notice={failure !== null ? <Alert inset variant="danger">{failure}</Alert> : undefined}
    >
      <CardRows>
      {/*
        ⚠️ **브랜드 마크는 연결됐을 때뿐이다** — 붙어 있는 것이 그 계정이기 때문이다. 미연결·장애는
        대상이 아직 없으므로 동작을 가리키는 lucide 글리프(`link-2`, 회색)가 선다.
      */}
      <ListRow
        as="li"
        className="border-border border-t first:border-t-0"
        icon={<IconTile>{connected ? <GithubIcon className="size-4" /> : <Link2 className="text-muted-foreground size-4" aria-hidden />}</IconTile>}
        title={<span className="flex min-w-0 items-center gap-2 text-base"><span className="truncate font-medium">{connected ? `@${account.login}` : m.account.github.rowName}</span><StatusBadge state={account.status === "reauthorize" ? "expired" : account.status === "unavailable" ? "couldNotCheck" : connected ? "connected" : "notConnected"} className="shrink-0" /></span>}
        description={account.status === "reauthorize" ? m.account.github.hintReauthorize
          : account.status === "unavailable" ? m.account.github.hintUnavailable
          : !connected ? m.account.github.hintNotConnected
          // ⚠️ **`null`(못 읽었다)과 `0`(고른 것이 없다)은 둘 다 줄을 안 그린다** — `Installed on 0
          // repositories.`는 연결이 깨진 것처럼 읽히고 행 높이만 갈린다 (DESIGN §6.67).
          : installedRepoCount !== null && installedRepoCount > 0
            ? m.account.github.installedOn(installedRepoCount)
            : undefined}
        actions={account.status === "unavailable" ? undefined : <div ref={controls} className="contents">
          {account.status === "reauthorize" ? (
            // 자동 redirect가 아니라 버튼이다 — 렌더 중 튕기면 callback 실패 시 루프다.
            <ConnectGithubButton dest="account" label={m.settings.account.reconnect} onResult={setFailure} />
          ) : connected ? (
            <>
              {/*
                ⚠️ **연결됨에만 선다** (DESIGN §6.67). 나머지 셋은 설치를 못 믿는 상태이고, 그때 밖으로
                나가는 문을 두면 사용자가 "고치러 갔는데 고칠 게 없는" 자리에 착지한다.
                ⚠️ **나가는 것이 왼쪽, 파괴적인 것이 오른쪽 끝이다** — 세션 구역과 같은 순서다.
                ⚠️ **`ButtonLink external`은 native `<a>`다** — `newTab`으로 새 탭을 열고
                기존 `rel`에 `noopener`·`noreferrer`를 보존·추가한다. 형과 링은 ButtonLink가 소유한다.
              */}
              {settingsUrl !== null && (
                <ButtonLink external href={settingsUrl} newTab rel="noreferrer">
                  {m.account.github.installationSettings}
                </ButtonLink>
              )}
              <DisconnectGithubButton onFailure={setFailure} />
            </>
          ) : account.status === "ok" ? (
            <ConnectGithubButton dest="account" label={m.settings.account.connect} onResult={setFailure} />
          ) : undefined}
          </div>} />
      </CardRows>
    </Card>
  );
}
