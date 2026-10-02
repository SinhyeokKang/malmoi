"use client";

import { useRef } from "react";
import { CopyButton } from "./copy-button";
import { Input } from "./input";

/** 복사 실패 시 값 전체를 선택해 키보드로 직접 복사할 수 있게 한다. */
export function SecretField({ value, label, size = "sm" }: { value: string; label: string; size?: "sm" | "md" }) {
  const ref = useRef<HTMLInputElement>(null);
  return <div className="flex items-center gap-2">
    <Input data-secret-field ref={ref} readOnly value={value} aria-label={label}
      onFocus={size === "md" ? event => event.currentTarget.select() : undefined}
      className={size === "sm" ? "min-w-0 flex-1 text-xs" : "min-w-0 flex-1 text-sm select-all"} />
    <CopyButton value={value} onCopyFailed={() => { ref.current?.focus(); ref.current?.select(); }} />
  </div>;
}
