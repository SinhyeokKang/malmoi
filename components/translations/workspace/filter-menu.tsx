"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * **한 컴포넌트 · 크기 둘** (핸드오프 `2b` — README §7 콤보박스). md 36은 PanelHeader, sm 28은 카드 머리다.
 *
 * ⚠️ **켜진 트리거는 테두리 `#0a0a0a` + 500이다** — Logs 필터(`log-filters.tsx`)와 같은 형. "선택에 굵기를 주지 않는다"는 목록 행의
 * 규칙이고, 필터는 그 자리 하나가 값을 바꾸므로 그 밖이다.
 * ⚠️ **접근 이름이 축을 포함한다**(`Completeness: Incomplete`) — 라벨만으로는 무엇을 고른 것인지 모른다.
 */
export type FilterOption = { value: string; label: string; group?: string };

export function FilterMenu({ axis, label, on, size, options, value, onSelect, disabled = false, hint }: {
  axis: string;
  label: string;
  on: boolean;
  size: "md" | "sm";
  options: readonly FilterOption[];
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  /** 메뉴 바닥의 설명 한 줄(`New from GitHub`의 기준). */
  hint?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronUp : ChevronDown;
  const groups: { name: string | undefined; items: FilterOption[] }[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last !== undefined && last.name === option.group) last.items.push(option);
    else groups.push({ name: option.group, items: [option] });
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`${axis}: ${label}`}
        disabled={disabled}
        className={cn(
          "hover:bg-primary-foreground focus-visible:ring-ring bg-background inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border focus-visible:ring-2 focus-visible:outline-none",
          "disabled:bg-accent disabled:text-neutral-400 disabled:cursor-not-allowed",
          size === "md" ? "h-9 px-2.5 text-sm" : "h-7 px-2 text-xs",
          on ? "border-foreground text-foreground font-medium" : "border-border text-muted-foreground",
        )}
      >
        {label}
        <Chevron className={cn("shrink-0", size === "md" ? "size-[15px]" : "size-3.5")} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-53">
        {groups.map((group, index) => (
          <div key={`${group.name ?? ""}-${index}`}>
            {index > 0 && <DropdownMenuSeparator />}
            {group.name !== undefined && <DropdownMenuLabel>{group.name}</DropdownMenuLabel>}
            {group.items.map(option => (
              <DropdownMenuItem key={option.value} selected={option.value === value} onSelect={() => onSelect(option.value)}>
                {option.label}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
        {hint !== undefined && <p className="text-muted-foreground max-w-60 px-3 pt-1 pb-2 text-xs">{hint}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
