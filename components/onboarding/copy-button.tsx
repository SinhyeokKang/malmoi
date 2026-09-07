"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * 복사 + **라벨 교체**(`복사됨`). `invite-form.tsx`의 복사 버튼이 선례지만 거기엔 확인이 없다 —
 * push 토큰과 워크플로 YAML은 **잃으면 CI가 죽는** 값이라 복사됐다는 확인이 필요하다 (design §3.13).
 *
 * ⚠️ **`navigator.clipboard`가 실패할 수 있다** (권한 거부·비보안 컨텍스트). 조용히 삼키면 사용자는
 * 복사된 줄 알고 화면을 떠나고 토큰을 영구히 잃는다 — 실패는 라벨로 말한다.
 *
 * 클래스는 DESIGN §6.4 툴바형이다 (`h-8 px-3 text-xs font-medium` + 포커스 링 셋).
 */
export function CopyButton({ value, label = "복사" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => setState("copied"),
          () => setState("failed"),
        );
      }}
      className={cn(
        "border-input hover:bg-accent h-8 shrink-0 rounded-md border px-3 text-xs font-medium",
        "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none",
      )}
    >
      {state === "copied" ? "복사됨" : state === "failed" ? "복사 실패 — 직접 선택해 주세요" : label}
    </button>
  );
}
