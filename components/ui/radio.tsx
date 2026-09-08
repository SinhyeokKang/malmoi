import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 후보 목록·기준 언어가 쓴다 (온보딩 ③④). native `<input type="radio">`라 키보드 화살표 이동을
 * 브라우저가 든다 — 목록 안에서 그것을 직접 구현하면 방향키 계약이 갈린다.
 */
export function Radio({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="radio"
        className={cn("border-input accent-primary size-4", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none", className)}
        {...props}
      />
      {label}
    </label>
  );
}
