"use client";

import { useState, type ReactNode, type RefObject } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./dropdown-menu";
import { FieldTrigger } from "./field-trigger";

/**
 * 접근 이름에 축을 포함하고, 켜짐은 테두리·굵기로도 구별한다.
 * 단일·다중 선택의 역할과 닫힘 규칙은 children의 메뉴 항목이 소유한다.
 *
 * ⚠️ 트리거에 `id`를 넘기지 않는다 — Radix의 triggerId를 덮으면 메뉴의 `aria-labelledby`가
 * 없는 id를 가리킨다(`undefined`도 덮는다). 포커스 복귀는 ref가 든다.
 * ⚠️ 트리거를 감싸지 않는다 — 필터 줄의 직속 버튼 기하를 보존한다.
 */
export function FilterMenu({ axis, label, on, size = "md", align = "start", disabled = false, triggerRef, onCloseAutoFocus, children }: {
  axis: string;
  label: string;
  on: boolean;
  size?: "md" | "sm";
  align?: "start" | "end";
  disabled?: boolean;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  onCloseAutoFocus?: (event: Event) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <FieldTrigger ref={triggerRef} aria-label={`${axis}: ${label}`} size={size} active={on} disabled={disabled} className="shrink-0">
          {label}
        </FieldTrigger>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-53" onCloseAutoFocus={onCloseAutoFocus}>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
