"use client";

import { useState, useTransition } from "react";

import { startGithubConnectForUser } from "@/app/(edit)/projects/actions";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";
import { cn } from "@/lib/utils";

/**
 * GitHub 계정 연결 — **사용자 수준** (design §3.6). 설정 화면의 같은 버튼과 다른 것은 인가와 착지
 * 지점 둘뿐이다: 여기는 프로젝트가 없으므로 `requireUser`만 지나고, 왕복 후 `/projects/new`로
 * 돌아온다(서명된 `dest`가 정한다).
 *
 * ⚠️ **렌더 중에 자동으로 튕기지 않는다** — 버튼이다. `github-account.tsx`의 `reauthorize`와 같은
 * 판단이다: callback이 실패하면 루프가 된다.
 *
 * 성공하면 Action이 GitHub으로 `redirect`하므로 이 컴포넌트는 실패만 그린다.
 */
export function ConnectGithubButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await startGithubConnectForUser();
            // 거부는 값으로 온다 — 성공은 redirect라 여기 도달하지 않는다 (ARCHITECTURE §6.3).
            if (!result.ok) setError(result.error);
          });
        }}
        className={cn(
          "bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium",
          "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-70",
        )}
      >
        {pending ? "이동하는 중…" : label}
      </button>
      {error !== null && <p className="text-destructive text-xs">{messageFor(error)}</p>}
    </div>
  );
}

function messageFor(error: string): string {
  if (isOnboardError(error)) return onboardErrorMessage(error);
  if (isConnectError(error)) return connectErrorMessage(error);
  return "GitHub으로 이동하지 못했어요. 잠시 뒤 다시 눌러 주세요.";
}
