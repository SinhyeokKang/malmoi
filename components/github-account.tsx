"use client";

import { Link2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";

import { disconnectGithub } from "@/app/(edit)/projects/actions";
import { startGithubConnect } from "@/app/(edit)/projects/[slug]/settings/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";

/**
 * GitHub 계정 연결·해제 (DESIGN §6.6). 연결은 **폼 제출**이다 — `startGithubConnect`가 성공하면
 * `redirect`로 GitHub에 나가므로 `useTransition`으로 감싸면 응답이 돌아오지 않는다.
 *
 * ⚠️ **두 Action이 서로 다른 파일에서 온다** (2026-09-07 리뷰 🟡9): 해제는 **사용자 수준**
 * (`projects/actions.ts`, 인가는 `requireUser`)이고 이 화면의 연결은 설정 화면 전용이다
 * (착지 지점이 그 프로젝트라 slug가 필요하다). 사용자 수준 연결은 `ConnectGithubButton`이 따로 있다.
 *
 * ⚠️ **`lucide-react` 1.x에 브랜드 아이콘이 없다** (DESIGN §6.8) — `Github`을 import하면 빌드가 죽는다.
 * 연결 버튼은 `Link2`다.
 */
export function GithubAccount({ slug, login }: { slug: string; login: string | null }) {
  if (login === null) return <ConnectForm slug={slug} label={m.settings.account.connect} />;

  return (
    <div className="flex items-center gap-3">
      {/* ⚠️ 핸들은 sans다 (2026-09-13) — `/account`만 걷으면 같은 값이 화면마다 갈린다. */}
      <span className="bg-muted rounded px-2 py-1 text-sm">@{login}</span>
      <DisconnectGithubButton />
    </div>
  );
}

/** 인가가 철회됐거나 토큰이 죽었을 때. **자동 redirect가 아니라 버튼이다** — callback이 실패하면 루프다. */
export function ReauthorizePrompt({ slug }: { slug: string }) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">{m.settings.account.reauthorize}</p>
      <ConnectForm slug={slug} label={m.settings.account.reconnect} />
    </div>
  );
}

function ConnectForm({ slug, label }: { slug: string; label: string }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async () => {
        // 성공하면 여기서 돌아오지 않는다 — Action이 GitHub으로 redirect한다.
        const result = await startGithubConnect({ slug });
        setError(
          isAccessError(result.error) ? accessErrorMessage(result.error) : m.settings.repository.connectFailed,
        );
      }}
      className="space-y-2"
    >
      <Button type="submit" variant="primary">
        <Link2 aria-hidden />
        {label}
      </Button>
      {error !== null && <Alert variant="danger">{error}</Alert>}
    </form>
  );
}

/**
 * 연결 해제 — **사용자 수준이라 slug를 받지 않는다** (2026-09-07 리뷰 🟡9).
 *
 * `/account`와 각 프로젝트의 설정 화면이 **같은 버튼**을 쓴다: 연결이 사용자 수준으로 열린 뒤로
 * **프로젝트를 하나도 안 만든 사용자**가 생길 수 있고, 그 사람에게는 설정 화면이 없다.
 * ⚠️ 2026-09-09까지 앞의 자리는 `/projects` 목록의 카드였다 — 갈 곳이 없어 거기 얹혀 있었고
 * 6b-4가 사용자 축 라우트를 만들어 옮겼다. `disconnectGithub`의 무효화 범위가 그 이동을 따라간다.
 */
export function DisconnectGithubButton({ onFailure }: {
  /**
   * 결과 문구를 바깥이 든다 — **실패는 문자열, 성공은 `null`이다.**
   * ⚠️ **`/account`에서 이 버튼은 리스트 항목의 우측 컨트롤이라** Alert를 형제로 두면 그 클러스터가
   * `shrink-0`이라 압축되지 않고 행이 패널 밖으로 밀린다 — 그 화면은 구역 Alert 자리로 올린다.
   * 안 주면 기존처럼 바로 아래에 그린다(설정 화면). `ConnectGithubButton`의 `onResult`가 같은 계약이다.
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
          {/*
            ⚠️ **`danger`가 아니라 `default`다** (2026-09-13 핸드오프). 붉은 글자는 `/account`에서
            되돌릴 수 없는 넷과 같은 무게로 읽히는데, 그 무게는 이제 확인 Dialog가 든다 —
            **같은 버튼이 화면마다 다른 무게면 그 자체가 결함이라** `/projects/:slug/settings`도 함께 바뀐다.
          */}
          <Button variant="default" aria-label={m.settings.account.disconnectLabel} loading={pending}>{m.settings.account.disconnect}</Button>
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
                      const result = await disconnectGithub();
                      report(result.ok ? null : isAccessError(result.error) ? accessErrorMessage(result.error) : m.settings.account.disconnectFailed);
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
