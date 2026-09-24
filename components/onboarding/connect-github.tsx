"use client";

import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";

import { startGithubConnectForUser, type ConnectVia, type UserConnectDest } from "@/app/(edit)/projects/actions";
import { GithubIcon } from "@/components/signin/brand-icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";

/**
 * GitHub 계정 연결 — **사용자 수준** (ARCHITECTURE §6.4). 설정 화면의 같은 버튼과 다른 것은 인가와 착지
 * 지점 둘뿐이다: 여기는 프로젝트가 없으므로 `requireUser`만 지나고, 왕복 후 `dest`가 가리키는
 * 사용자 축 화면(`/projects/new` 또는 `/account`)으로 돌아온다(서명된 값이 정한다).
 *
 * ⚠️ **렌더 중에 자동으로 튕기지 않는다** — 버튼이다. `github-account.tsx`의 `reauthorize`와 같은
 * 판단이다: callback이 실패하면 루프가 된다.
 *
 * ⚠️ **착지는 `dest`가 정하고 그 값은 갈래 이름뿐이다** (6b-4). `StateDest`를 통째로 넘길 수 있게
 * 하면 클라이언트가 착지를 고르게 되고, 그러면 Action에 open redirect 판정이 생긴다.
 *
 * 성공하면 Action이 GitHub으로 `redirect`하므로 이 컴포넌트는 실패만 그린다.
 */
export function ConnectGithubButton({
  dest,
  label,
  back,
  onResult,
}: {
  dest: UserConnectDest;
  label: string;
  /**
   * `/projects/new`로 돌아올 때 되돌려 줄 목록 상태 (2026-09-13). 없으면 맨몸 착지이고, 그러면
   * 모달 뒤 목록이 연결을 누르기 직전과 **달라진다** — 그 상태로 닫으면 검색어가 사라진다.
   */
  back?: { filter?: string; q?: string };
  /**
   * 실패 문구를 바깥이 든다. ⚠️ **`/account`에서 이 버튼은 리스트 항목의 우측 컨트롤이라**
   * 실패 Alert를 형제로 두면 그 클러스터가 `shrink-0`이라 압축되지 않고 **행이 패널 밖으로
   * 밀린다** (2026-09-13 — `DisconnectGithubButton`이 같은 이유로 먼저 받은 처방이다).
   * 안 주면 기존처럼 바로 아래에 그린다(온보딩·설정 화면).
   */
  onResult?: (message: string | null) => void;
}) {
  const connect = useGithubConnect({ dest, back, onResult });

  return (
    <div className="space-y-2">
      <Button
        variant="primary"
        loading={connect.pending}
        // ⚠️ 라벨과 같게 두면 대기 상태가 안 보인다 — GitHub으로 나가는 왕복이라 문구가 "이동"이다.
        onClick={() => connect.start("authorize")}
      >
        <GithubIcon className="size-4" />
        {label}
      </Button>
      {connect.error !== null && <Alert variant="danger">{connect.error}</Alert>}
    </div>
  );
}

/**
 * 연결 왕복 하나의 pending·실패 (install-and-connect). ⚠️ **한 블록의 버튼들이 이것 하나를 공유한다** — ①의
 * 주 버튼(Install)과 보조 링크(Authorize)가 각자 transition을 들면 둘 다 눌려 state 쿠키가 덮이고, 먼저 떠난
 * 왕복이 `state-mismatch`로 돌아온다.
 */
export function useGithubConnect({
  dest,
  back,
  onResult,
}: {
  dest: UserConnectDest;
  back?: { filter?: string; q?: string };
  onResult?: (message: string | null) => void;
}): { pending: boolean; via: ConnectVia | null; error: string | null; start: (via: ConnectVia) => void } {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** 마지막으로 누른 갈래 — 막는 것은 `pending` 하나이고, 스피너 자리만 이것이 정한다 (audit-ux #27). */
  const [via, setVia] = useState<ConnectVia | null>(null);
  const report = (message: string | null) => { if (onResult === undefined) setError(message); else onResult(message); };

  return {
    pending,
    via,
    error,
    start: (next) => {
      report(null);
      setVia(next);
      startTransition(async () => {
        // 거부는 값으로 온다 — 성공은 redirect라 여기 도달하지 않는다 (ARCHITECTURE §6.3).
        // ⚠️ 그 redirect는 reject로 오므로 되던지고, 그 밖의 throw만 거부와 같은 자리로 접는다 (audit-ux #14).
        let result: Awaited<ReturnType<typeof startGithubConnectForUser>>;
        try { result = await startGithubConnectForUser(dest, back ?? {}, next); }
        catch (thrown) { unstable_rethrow(thrown); report(m.settings.repository.connectFailed); return; }
        if (!result.ok) report(messageFor(result.error));
      });
    },
  };
}

function messageFor(error: string): string {
  if (isOnboardError(error)) return onboardErrorMessage(error);
  if (isConnectError(error)) return connectErrorMessage(error);
  return m.settings.repository.connectFailed;
}
