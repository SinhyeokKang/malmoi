"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";

/**
 * 복사 + **라벨 교체** (DESIGN §6.4). push 토큰과 워크플로 YAML은 **잃으면 CI가 죽는** 값이라
 * 복사됐다는 확인이 필요하다 (DESIGN §6.6).
 *
 * ⚠️ **`navigator.clipboard`가 실패할 수 있다** (권한 거부·비보안 컨텍스트). 조용히 삼키면 사용자는
 * 복사된 줄 알고 화면을 떠나고 토큰을 영구히 잃는다 — 실패는 라벨로 말한다.
 */
export function CopyButton({
  value,
  label = m.common.copy,
  size = "md",
}: {
  value: string;
  label?: string;
  /** ⚠️ **코드 블록 상단은 `sm`(28)이고 값 칩 옆은 `md`(36)다** — 시안이 둘을 가른다. */
  size?: "sm" | "md";
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <Button
      size={size}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => setState("copied"),
          () => setState("failed"),
        );
      }}
    >
      {/* ⚠️ 글리프가 14다 — `Button`의 기본 16이 아니라 시안값이다 (핸드오프 1d). */}
      {state === "copied" ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {state === "copied" ? m.common.copied : state === "failed" ? m.common.copyFailed : label}
    </Button>
  );
}
