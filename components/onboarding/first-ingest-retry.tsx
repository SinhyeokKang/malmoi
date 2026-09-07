"use client";

import { useState, useTransition } from "react";

import { runFirstIngest } from "@/app/(edit)/projects/actions";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { ingestHeadline, isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";
import { cn } from "@/lib/utils";

/**
 * 첫 적재 [다시 시도] — **온보딩 결과 화면과 같은 Action이다** (`runFirstIngest`, design §3.11).
 * `retryFirstIngest`를 따로 두지 않는 이유는 판정(`awaiting_first_sync`가 아니면 `not-awaiting`)이
 * 한 자리에 있어야 하기 때문이다.
 *
 * ⚠️ **실패 사유는 이 호출의 반환값에만 있다.** 중간 상태를 저장하지 않으므로(design §3.4) 화면을
 * 다시 열면 사유를 모른다 — 그래서 인라인으로 남기고 `revalidatePath`가 상태 텍스트를 갱신한다.
 *
 * ⚠️ **`canRun`이 false여도 이 컴포넌트는 마운트된 채 있어야 한다.** 성공하면 `revalidatePath`가
 * 서버를 다시 렌더해 상태가 `ready`로 바뀌는데, 그때 컴포넌트가 사라지면 **방금 받은 결과 문구가
 * 함께 사라진다** — 부분 실패(`failed > 0`)에서 "M건을 읽지 못했어요"가 아무에게도 닿지 않는다
 * (불변식 9 · 실물 검증 2026-09-07). 같은 자리에 남아 있으면 클라이언트 상태가 재렌더를 넘어간다.
 */
export function FirstIngestRetry({ slug, canRun }: { slug: string; canRun: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; text: string; errors: { path: string; message: string }[] }
    | { ok: false; error: string }
    | null
  >(null);

  return (
    <div className="space-y-2">
      {canRun && (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const outcome = await runFirstIngest({ slug });
            setResult(
              outcome.ok
                // 불변식 9 — 0건이 아니면 성공 문구를 그대로 쓰지 않는다.
                ? { ok: true, text: ingestHeadline(outcome.count, outcome.failed), errors: outcome.errors }
                : { ok: false, error: outcome.error },
            );
          });
        }}
        className={cn(
          "border-input hover:bg-accent h-8 rounded-md border px-3 text-xs font-medium",
          "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none",
          "disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent",
        )}
      >
        {pending ? "적재하는 중…" : "다시 시도"}
      </button>
      )}
      {result !== null &&
        (result.ok ? (
          <div className="space-y-1">
            <p className="text-xs">{result.text}</p>
            {/*
              ⚠️ **어느 파일을 못 읽었는지 함께 보인다** (2026-09-07 리뷰 ⚪12). 헤드라인은 개수만
              말하는데 그것만으로는 사용자가 할 일이 없다 — 온보딩 결과 화면과 같은 상위 5건이다.
              같은 파일에 에러가 둘 나올 수 있어 index를 섞는다(표시 전용 목록이다).
            */}
            {result.errors.slice(0, 5).map((e, index) => (
              <p key={`${e.path}\u0000${index}`} className="text-muted-foreground text-xs">
                <span className="text-mono">{e.path}</span> — {e.message}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-destructive text-xs">{messageFor(result.error)}</p>
        ))}
    </div>
  );
}

function messageFor(error: string): string {
  if (isOnboardError(error)) return onboardErrorMessage(error);
  if (isAccessError(error)) return accessErrorMessage(error);
  return "적재하지 못했어요. 잠시 뒤 다시 눌러 주세요.";
}
