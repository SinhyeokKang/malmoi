"use client";

import { useState, useTransition } from "react";

import { accessErrorMessage, isAccessError } from "@/lib/auth/message";

import { disconnectGithub } from "@/app/(edit)/projects/actions";
import { startGithubConnect } from "@/app/(edit)/projects/[slug]/settings/actions";

/**
 * GitHub 계정 연결·해제 (design §8 섹션 2). 연결은 **폼 제출**이다 — `startGithubConnect`가 성공하면
 * `redirect`로 GitHub에 나가므로 `useTransition`으로 감싸면 응답이 돌아오지 않는다.
 *
 * ⚠️ **두 Action이 서로 다른 파일에서 온다** (2026-09-07 리뷰 🟡9): 해제는 **사용자 수준**
 * (`projects/actions.ts`, 인가는 `requireUser`)이고 이 화면의 연결은 설정 화면 전용이다
 * (착지 지점이 그 프로젝트라 slug가 필요하다). 사용자 수준 연결은 `ConnectGithubButton`이 따로 있다.
 */
export function GithubAccount({ slug, login }: { slug: string; login: string | null }) {
  if (login === null) return <ConnectForm slug={slug} label="GitHub 연결" />;

  return (
    <div className="flex items-center gap-3">
      <span className="text-mono bg-muted rounded px-2 py-1">@{login}</span>
      <DisconnectGithubButton />
    </div>
  );
}

/** 인가가 철회됐거나 토큰이 죽었을 때. **자동 redirect가 아니라 버튼이다** — callback이 실패하면 루프다. */
export function ReauthorizePrompt({ slug }: { slug: string }) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">GitHub 인가가 풀렸어요.</p>
      <ConnectForm slug={slug} label="GitHub 다시 연결" />
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
        setError(isAccessError(result.error) ? accessErrorMessage(result.error) : "연결을 시작하지 못했어요.");
      }}
      className="space-y-2"
    >
      <button
        type="submit"
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring rounded-md px-4 py-2 text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"
      >
        {label}
      </button>
      {error !== null && <p className="text-destructive text-xs">{error}</p>}
    </form>
  );
}

/**
 * 연결 해제 — **사용자 수준이라 slug를 받지 않는다** (2026-09-07 리뷰 🟡9).
 *
 * 설정 화면과 `/projects`의 계정 섹션이 **같은 버튼**을 쓴다: 연결이 사용자 수준으로 열린 뒤로
 * **프로젝트를 하나도 안 만든 사용자**가 생길 수 있고, 그 사람에게는 설정 화면이 없다.
 */
export function DisconnectGithubButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await disconnectGithub();
            if (!result.ok) {
              setError(isAccessError(result.error) ? accessErrorMessage(result.error) : "해제하지 못했어요.");
            }
          });
        }}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded text-xs underline focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed"
      >
        {pending ? "해제하는 중…" : "연결 해제"}
      </button>
      {error !== null && <p className="text-destructive text-xs">{error}</p>}
    </>
  );
}
