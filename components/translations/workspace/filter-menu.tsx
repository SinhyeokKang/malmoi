"use client";

import type { ReactNode } from "react";

import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { FilterMenu } from "@/components/ui/filter-menu";

/**
 * options의 그룹·설명은 번역 화면의 계약이고, 트리거·메뉴 껍데기는 공통 FilterMenu가 소유한다.
 */
export type FilterOption = { value: string; label: string; group?: string };

export function OptionsFilterMenu({ axis, label, on, size, options, value, onSelect, disabled = false, hint, align = "start" }: {
  axis: string;
  label: string;
  on: boolean;
  size: "md" | "sm";
  options: readonly FilterOption[];
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  /** 메뉴 바닥의 설명 한 줄(`New keys`의 기준). */
  hint?: ReactNode;
  /** 메뉴 정렬 — 패널 머리 오른쪽 끝의 트리거는 `end`다(시작 정렬이면 트리거보다 넓은 메뉴가 화면 끝 쪽으로 자란다). 자리는 호출부가 안다. */
  align?: "start" | "end";
}) {
  const groups: { name: string | undefined; items: FilterOption[] }[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last !== undefined && last.name === option.group) last.items.push(option);
    else groups.push({ name: option.group, items: [option] });
  }
  return (
    <FilterMenu axis={axis} label={label} on={on} size={size} disabled={disabled} align={align}>
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
    </FilterMenu>
  );
}
