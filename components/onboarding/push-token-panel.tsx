"use client";

import { RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";

import { rotatePushToken } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";

import { CopyButton } from "./copy-button";

/**
 * push 토큰 재발급 (PRODUCT §7.8). **원문은 이 반환값에만 있다** — 저장되는 것은 해시뿐이다.
 *
 * ⚠️ **경고를 버튼 *위*에 상시로 둔다.** confirm 다이얼로그 전례가 리포에 없어 만들지 않는 대신,
 * 되돌릴 수 없는 결과(옛 토큰 즉시 무효 → 대상 리포 CI가 401)를 누르기 전에 읽게 한다.
 *
 * ⚠️ **이 블록은 readiness와 무관하다** — 조건부 분기가 없으므로 `revalidatePath`가 결과를 씻지 않는다
 * (POSTMORTEM 2026-09-07).
 */
export function PushTokenPanel({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        {m.settings.token.description(<span className="text-mono">PUSH_TOKEN</span>)}
      </p>
      <Button
        loading={pending}
        onClick={() => {
          setToken(null);
          setError(null);
          startTransition(async () => {
            const result = await rotatePushToken({ slug });
            if (result.ok) setToken(result.pushToken);
            else setError(result.error);
          });
        }}
      >
        <RotateCcw aria-hidden />
        {m.settings.token.rotate}
      </Button>
      {error !== null && <Alert variant="danger">{messageFor(error)}</Alert>}
      {token !== null && (
        <div className="space-y-1">
          {/*
            ⚠️ **굵게 "보이지" 않되 `<strong>`은 남긴다** (2026-09-13 사용자 + 리뷰). 토큰을 다시 못
            본다는 경고라 색만으로 말하면 스크린리더와 고대비 모드에서 사라진다.
          */}
          <p className="text-xs leading-[1.7]">
            <strong className="text-foreground font-normal">{m.settings.token.warning}</strong>
          </p>
          <div className="flex items-center gap-2">
            {/* 토큰은 식별자라 mono다 (DESIGN §4.1) */}
            <code className="text-mono bg-muted min-w-0 flex-1 truncate rounded px-2 py-1">{token}</code>
            <CopyButton value={token} />
          </div>
        </div>
      )}
    </div>
  );
}

function messageFor(error: string): string {
  if (isOnboardError(error)) return onboardErrorMessage(error);
  if (isAccessError(error)) return accessErrorMessage(error);
  return m.settings.token.failed;
}
