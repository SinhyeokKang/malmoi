"use client";

import { useState, useTransition } from "react";

import { triggerPullAction } from "@/app/(edit)/actions";
import { pullMessage, type PullMessage } from "@/lib/pull/message";
import { cn } from "@/lib/utils";

/**
 * 변경 내보내기 버튼 (pull 트리거).
 *
 * **토스트를 쓰지 않는다.** `sonner`가 설치돼 있지만 이 리포에 사용처가 0곳이고, 기존 관용은
 * `translation-input.tsx`의 인라인 한 줄이다 — pull이 첫 토스트가 되면 피드백 방식이 둘로 갈린다.
 *
 * **no-op에도 반드시 뭔가 보인다.** 편집이 없는 날이 기본 경로라(MVP §3.3 1.5) 성공 직후 한 번
 * 더 누르면 반드시 그 경로이고, 무반응이면 편집자가 고장으로 읽는다. 문구는 `pullMessage`가
 * 정한다 — 케이스 누락이 컴파일 에러가 되는 곳이 거기 하나다.
 */
export function PullButton({ slug }: { slug: string }) {
  const [message, setMessage] = useState<PullMessage | null>(null);
  const [pending, startTransition] = useTransition();

  function trigger() {
    setMessage(null);
    startTransition(async () => {
      setMessage(pullMessage(await triggerPullAction(slug)));
    });
  }

  return (
    <div className="flex items-center gap-2">
      {/* 상태 문구가 버튼 왼쪽에 온다 — 헤더 높이를 늘리지 않으려고 한 줄에 둔다 */}
      {(pending || message) && (
        <span className="text-xs">
          {pending ? (
            <span className="text-muted-foreground">내보내는 중…</span>
          ) : message ? (
            <span
              className={cn(
                message.tone === "danger" && "text-destructive",
                // 버린 값이 있는 결과는 조용하면 안 된다 (SAAS 불변식 9) — amber는 §6.2에 등재된 색이다.
                message.tone === "warning" && "text-amber-800",
                (message.tone === "info" || message.tone === "success") && "text-muted-foreground",
              )}
            >
              {message.text}
              {message.href && (
                <>
                  {" "}
                  <a
                    href={message.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline"
                  >
                    {message.linkLabel}
                  </a>
                </>
              )}
            </span>
          ) : null}
        </span>
      )}
      <button
        type="button"
        onClick={trigger}
        // pending 중 연타를 막는다 — 두 실행이 병렬이면 둘 다 열린 PR을 못 보고
        // 각자 생성을 시도해 GitHub이 422로 거부한다.
        disabled={pending}
        className={cn(
          "border-input hover:bg-accent h-8 shrink-0 rounded-md border px-3 text-xs",
          "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none",
          "disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent",
        )}
      >
        변경 내보내기
      </button>
    </div>
  );
}
