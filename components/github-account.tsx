"use client";

import { Link2 } from "lucide-react";
import { useState, useTransition } from "react";

import { disconnectGithub } from "@/app/(edit)/projects/actions";
import { startGithubConnect } from "@/app/(edit)/projects/[slug]/settings/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";

/**
 * GitHub 계정 연결·해제 (design §8 섹션 2). 연결은 **폼 제출**이다 — `startGithubConnect`가 성공하면
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
      {/* GitHub 핸들은 식별자라 mono다 (DESIGN §4.1) */}
      <span className="text-mono bg-muted rounded px-2 py-1">@{login}</span>
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
export function DisconnectGithubButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        loading={pending}
        loadingLabel={m.settings.account.disconnecting}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await disconnectGithub();
            if (!result.ok) {
              setError(
                isAccessError(result.error)
                  ? accessErrorMessage(result.error)
                  : m.settings.account.disconnectFailed,
              );
            }
          });
        }}
      >
        {m.settings.account.disconnect}
      </Button>
      {error !== null && <Alert variant="danger">{error}</Alert>}
    </>
  );
}
