"use client";

import { useState, useTransition } from "react";

import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";

import { connectRepository } from "@/app/(edit)/projects/[slug]/settings/actions";

/**
 * 리포 재연결 (design §8). `invite-form.tsx`와 같은 형 — **결과를 인라인으로 보이고 redirect하지
 * 않는다** (`app/(edit)/actions.ts`의 규칙).
 *
 * ⚠️ **성공 문구를 따로 두지 않는다.** `revalidatePath`가 서버에서 돌아 건강성 배지가 `ok`로
 * 바뀌는 것이 곧 성공 신호다 — 문구를 하나 더 두면 배지와 어긋날 수 있다.
 */
export function ReconnectButton({ slug, label }: { slug: string; label: string }) {
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
            const result = await connectRepository({ slug });
            // 거부는 값으로 온다 — 던지지 않으므로 화면이 죽지 않는다 (ARCHITECTURE §6.3).
            if (!result.ok) setError(result.error);
          });
        }}
        className="border-input hover:bg-accent focus-visible:ring-ring h-8 rounded-md border px-3 text-xs font-medium focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
      >
        {pending ? "연결하는 중…" : label}
      </button>
      {error !== null && <p className="text-destructive text-xs">{messageFor(error)}</p>}
    </div>
  );
}

/**
 * 두 union이 겹치는 값은 `unavailable` 하나이고 뜻이 같다 — 먼저 보는 쪽이 이겨도 문제가 없다.
 * 모르는 값에 던지지 않는다: Action이 새 갈래를 늘려도 화면이 죽지 않아야 한다.
 */
function messageFor(error: string): string {
  if (isAccessError(error)) return accessErrorMessage(error);
  if (isConnectError(error)) return connectErrorMessage(error);
  return "연결하지 못했어요. 잠시 뒤 다시 눌러 주세요.";
}
