"use client";

import { X } from "lucide-react";

import { useMessages } from "@/components/i18n/messages-provider";

import { Button } from "./button";

/**
 * `Input`의 지우기 버튼 — **접근 이름이 화면 언어라 클라이언트 모듈로 떼었다.** `Input`은 `fieldClass` 같은 상수도 내보내 서버에서 읽히므로
 * `"use client"`를 달 수 없고, 사전은 이 버튼만 읽는다.
 */
export function InputClearButton({ disabled, onClear }: { disabled?: boolean; onClear?: () => void }) {
  const m = useMessages();
  return <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} aria-label={m.common.clearSearch}
    className="absolute top-1/2 right-1 -translate-y-1/2"
    onMouseDown={event => event.preventDefault()}
    onClick={event => {
      const input = event.currentTarget.parentElement?.querySelector("input");
      if (!input) return;
      // React의 값 추적을 우회하는 native setter여야 빈 값 onChange가 한 번 들어온다.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      onClear?.();
      input.focus();
    }}><X aria-hidden className="size-3.5" /></Button>;
}
