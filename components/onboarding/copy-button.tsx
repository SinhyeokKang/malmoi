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

/**
 * push 토큰 값 칸 + 복사 — 온보딩 ④와 Settings 회전 결과가 **같은 형**이다 (ux-drift-unify 5-Y13 — Settings만 테두리·높이 없이 radius 4였다).
 * 값 칩이 필드와 같은 형이다 — 높이 36 · radius 10 · border · 안쪽 여백 10 (핸드오프 1d).
 * ⚠️ **mono는 YAML 블록 하나뿐이다** — 토큰 칩도 sans다 (DESIGN §4.1). `<code>`는 preflight가 mono를 깔아서 `font-sans`를 명시한다.
 * MCP 토큰 칸(`token-modal.tsx`)은 글자만 14인 핸드오프 판정이라 이것을 쓰지 않는다.
 */
export function TokenField({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code data-token-field="" className="border-input bg-muted flex h-9 min-w-0 flex-1 items-center truncate rounded-md border px-2.5 font-sans text-xs">
        {value}
      </code>
      <CopyButton value={value} />
    </div>
  );
}
