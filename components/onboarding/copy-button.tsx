"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";

/**
 * 복사 + **라벨 교체** (DESIGN §6.4). push 토큰과 워크플로 YAML은 **잃으면 CI가 죽는** 값이라
 * 복사됐다는 확인이 필요하다 (design §3.13).
 *
 * ⚠️ **`navigator.clipboard`가 실패할 수 있다** (권한 거부·비보안 컨텍스트). 조용히 삼키면 사용자는
 * 복사된 줄 알고 화면을 떠나고 토큰을 영구히 잃는다 — 실패는 라벨로 말한다.
 */
export function CopyButton({ value, label = m.common.copy }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <Button
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => setState("copied"),
          () => setState("failed"),
        );
      }}
    >
      {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
      {state === "copied" ? m.common.copied : state === "failed" ? m.common.copyFailed : label}
    </Button>
  );
}
