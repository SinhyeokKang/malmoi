"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { connectRepository } from "@/app/(edit)/projects/[slug]/settings/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";

/**
 * 리포 재연결 (DESIGN §6.6). **결과를 인라인으로 보이고 redirect하지 않는다**
 * (`app/(edit)/actions.ts`의 규칙).
 *
 * ⚠️ **성공 문구를 따로 두지 않는다.** `revalidatePath`가 서버에서 돌아 건강성 문구가 `ok`로
 * 바뀌는 것이 곧 성공 신호다 — 문구를 하나 더 두면 그 상태와 어긋날 수 있다.
 */
export function ReconnectButton({ slug, label, variant, onFailure }: {
  slug: string;
  label: string;
  /**
   * ⚠️ **Home의 미연결 배너에서만 `primary`다** (캔버스 `2c`) — 그 화면에서 할 수 있는 일이 이것
   * 하나라 검정이 Publish가 아니다. 설정 화면은 블록이 여럿이라 기본형을 쓴다.
   */
  variant?: "primary";
  /** Settings owns its card-wide notice; Home keeps the local fallback. */
  onFailure?: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        loading={pending}
        aria-busy={pending}
        onClick={() => {
          setError(null);
          onFailure?.(null);
          startTransition(async () => {
            // 거부는 값으로 온다 (ARCHITECTURE §6.3). ⚠️ **통신 실패는 던진다** (audit #24) — 그것도 같은 자리로 접는다.
            let error: string | null;
            try {
              const result = await connectRepository({ slug });
              error = result.ok ? null : result.error;
            } catch { error = FAILED; }
            if (error !== null) {
              if (onFailure) onFailure(messageFor(error));
              else setError(error);
            }
          });
        }}
      >
        <RefreshCw aria-hidden />
        {label}
      </Button>
      {error !== null && <Alert variant="danger">{messageFor(error)}</Alert>}
    </div>
  );
}

/**
 * 두 union이 겹치는 값은 `unavailable` 하나이고 뜻이 같다 — 먼저 보는 쪽이 이겨도 문제가 없다.
 * 모르는 값에 던지지 않는다: Action이 새 갈래를 늘려도 화면이 죽지 않아야 한다.
 */
/** 호출이 던졌다 — 어느 union에도 없는 값이라 `messageFor`의 폴백(`connectFailed`)으로 떨어진다. */
const FAILED = "thrown";

function messageFor(error: string): string {
  if (isAccessError(error)) return accessErrorMessage(error);
  if (isConnectError(error)) return connectErrorMessage(error);
  return m.settings.repository.connectFailed;
}
