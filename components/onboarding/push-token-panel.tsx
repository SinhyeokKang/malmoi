"use client";

import { useState, useTransition } from "react";

import { rotatePushToken } from "@/app/(edit)/projects/actions";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";

/**
 * push 토큰 재발급 (design §3.13). **원문은 이 반환값에만 있다** — 저장되는 것은 해시뿐이다.
 *
 * ⚠️ **경고를 버튼 *위*에 상시로 둔다.** confirm 다이얼로그 전례가 리포에 없어 만들지 않는 대신,
 * 되돌릴 수 없는 결과(옛 토큰 즉시 무효 → 대상 리포 CI가 401)를 누르기 전에 읽게 한다.
 */
export function PushTokenPanel({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        재발급하면 기존 토큰은 즉시 무효가 되고, 리포의 <span className="text-mono">PUSH_TOKEN</span> secret을
        바꿔야 CI가 다시 돌아요.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setToken(null);
          setError(null);
          startTransition(async () => {
            const result = await rotatePushToken({ slug });
            if (result.ok) setToken(result.pushToken);
            else setError(result.error);
          });
        }}
        className={cn(
          "border-input hover:bg-accent h-8 rounded-md border px-3 text-xs font-medium",
          "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none",
          "disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent",
        )}
      >
        {pending ? "발급하는 중…" : "토큰 재발급"}
      </button>
      {error !== null && <p className="text-destructive text-xs">{messageFor(error)}</p>}
      {token !== null && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            <strong>이 화면을 벗어나면 다시 볼 수 없어요.</strong> 잃어버리면 다시 재발급해야 해요.
          </p>
          <div className="flex items-center gap-2">
            {/* 토큰은 식별자라 mono다 (DESIGN §4.1) */}
            <code className="text-mono bg-muted min-w-0 flex-1 truncate rounded px-2 py-1">{token}</code>
            <CopyButton value={token} label="토큰 복사" />
          </div>
        </div>
      )}
    </div>
  );
}

function messageFor(error: string): string {
  if (isOnboardError(error)) return onboardErrorMessage(error);
  if (isAccessError(error)) return accessErrorMessage(error);
  return "재발급하지 못했어요. 잠시 뒤 다시 눌러 주세요.";
}
