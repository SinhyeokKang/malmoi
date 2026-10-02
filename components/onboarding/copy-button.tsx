"use client";

import { CopyButton } from "@/components/ui/copy-button";

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
