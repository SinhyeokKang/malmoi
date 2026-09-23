"use client";

import { KeyRound, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";

import { rotatePushToken } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { isAccessError } from "@/lib/auth/message";
import { settingsAccessMessage } from "@/lib/settings/message";
import { m } from "@/lib/i18n";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";

import { CopyButton } from "@/components/onboarding/copy-button";

/**
 * push 토큰 재발급 (PRODUCT §7.8). **원문은 이 반환값에만 있다** — 저장되는 것은 해시뿐이다.
 *
 * ⚠️ **확인을 한 번 받는다** (audit #19) — 옛 토큰이 즉시 무효가 되고(대상 리포 CI가 401) 되돌릴 수 없다.
 * 상시 경고만으로는 **성공 직후의 재클릭**을 못 막았다: 방금 받아 아직 붙이지 않은 토큰까지 한 번에 죽는다.
 * 같은 화면의 되돌릴 수 없는 행동(Archive·Remove)이 이미 Dialog를 받는다.
 *
 * ⚠️ **이 블록은 readiness와 무관하다** — 조건부 분기가 없으므로 `revalidatePath`가 결과를 씻지 않는다
 * (POSTMORTEM 2026-09-07).
 */
export function PushTokenPanel({ slug, disabled = false }: { slug: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
    <div className="space-y-2 px-4 py-[13px]">
      <div className="flex items-center gap-3 @max-[640px]:grid @max-[640px]:grid-cols-[28px_1fr] @max-[640px]:items-start">
        <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded"><KeyRound className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1 space-y-[3px]"><p className="text-base font-medium">{m.settings.token.title}</p><p className="text-muted-foreground text-xs">
          {m.settings.token.description(<span className="text-foreground">PUSH_TOKEN</span>)}
        </p></div>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            className="[&_.animate-spin]:size-3.5 @max-[640px]:col-start-2 @max-[640px]:justify-self-start"
            disabled={disabled}
            /* ⚠️ `loading`이 아니라 `busy`다 (audit #32) — 확정하면 Dialog가 이 트리거로 포커스를 돌려주는데, 같은 커밋에
               진짜 `disabled`가 되면 그 포커스가 `body`로 빠진다. */
            busy={pending}
          >
            {!pending && <RotateCcw aria-hidden />}
            {m.settings.token.rotate}
          </Button>
        </DialogTrigger>
        <DialogContent
          title={m.settings.token.confirmTitle}
          description={m.settings.token.confirmBody}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="default">{m.common.cancel}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  variant="danger"
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
                  {m.settings.token.confirmAction}
                </Button>
              </DialogClose>
            </>
          }
        />
      </Dialog>
      </div>
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
            {/* ⚠️ `<code>`는 preflight가 mono를 깔아서 `font-sans`를 명시한다 — mono는 코드 블록 전용이다 (DESIGN §4.1) */}
            <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1 font-sans text-xs">{token}</code>
            <CopyButton value={token} />
          </div>
        </div>
      )}
    </div>
    {/* 보관 상태가 오면(`disabled`) 옛 거부를 내린다 — 카드 아래 `archivedReason`이 대신 말한다 (QA D1). */}
    {error !== null && !disabled && <Alert inset variant="danger">{messageFor(error)}</Alert>}
    </>
  );
}

function messageFor(error: string): string {
  if (isOnboardError(error)) return onboardErrorMessage(error);
  if (isAccessError(error)) return settingsAccessMessage(error);
  return m.settings.token.failed;
}
