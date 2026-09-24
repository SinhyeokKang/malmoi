"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";

import { disconnectGithub } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";

/**
 * 연결 해제 — **사용자 수준이라 slug를 받지 않는다** (2026-09-07 리뷰 🟡9).
 *
 * `/account`가 쓰는 버튼이다. 프로젝트 설정의 계정 블록은 복구 링크로 바뀌었다. 연결이 사용자 수준으로 열린 뒤로
 * **프로젝트를 하나도 안 만든 사용자**가 생길 수 있고, 그 사람에게는 설정 화면이 없다.
 * ⚠️ 2026-09-09까지 앞의 자리는 `/projects` 목록의 카드였다 — 갈 곳이 없어 거기 얹혀 있었고
 * 6b-4가 사용자 축 라우트를 만들어 옮겼다. `disconnectGithub`의 무효화 범위가 그 이동을 따라간다.
 */
export function DisconnectGithubButton({ onFailure }: {
  /**
   * 결과 문구를 바깥이 든다 — **실패는 문자열, 성공은 `null`이다.**
   * ⚠️ **`/account`에서 이 버튼은 리스트 항목의 우측 컨트롤이라** Alert를 형제로 두면 그 클러스터가
   * `shrink-0`이라 압축되지 않고 행이 패널 밖으로 밀린다 — 그 화면은 구역 Alert 자리로 올린다.
   * 안 주면 바로 아래에 그린다. `ConnectGithubButton`의 `onResult`가 같은 계약이다.
   */
  onFailure?: (message: string | null) => void;
} = {}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** ⚠️ **성공도 보고한다** — `null`을 안 보내면 한 번 실패한 뒤 성공해도 그 Alert가 그대로 선다. */
  function report(message: string | null) {
    if (onFailure === undefined) setError(message);
    else onFailure(message);
  }

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="danger" aria-label={m.settings.account.disconnectLabel} busy={pending}>{m.settings.account.disconnect}</Button>
        </DialogTrigger>
        <DialogContent
          title={m.account.github.confirmDisconnect}
          description={m.account.github.confirmHint}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="default">{m.common.cancel}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  variant="danger"
                  onClick={() => {
                    report(null);
                    startTransition(async () => {
                      // ⚠️ 던지면 error boundary가 `/account` 전체를 삼킨다 (audit #24) — 거부와 같은 자리로 접는다.
                      let result: Awaited<ReturnType<typeof disconnectGithub>> | null;
                      try { result = await disconnectGithub(); } catch { result = null; }
                      if (result?.ok) report(null);
                      else report(result !== null && isAccessError(result.error) ? accessErrorMessage(result.error) : m.settings.account.disconnectFailed);
                    });
                  }}
                >
                  {m.settings.account.disconnect}
                </Button>
              </DialogClose>
            </>
          }
        />
      </Dialog>
      {error !== null && <Alert variant="danger">{error}</Alert>}
    </>
  );
}
