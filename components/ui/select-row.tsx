"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
import { Checkbox } from "./checkbox";
import { Radio } from "./radio";

type Shape = {
  label: ReactNode;
  checked: boolean;
  /** 파일의 포함 여부와 미리보기 선택은 별개다. */
  active?: boolean;
  first?: boolean;
  previousChecked?: boolean;
  expand?: ReactNode;
  aside?: ReactElement;
  className?: string;
};
type Props = Shape & (
  | ({ input: "radio" } & Omit<ComponentProps<typeof Radio>, "label" | "className" | "checked">)
  | ({ input: "checkbox" } & Omit<ComponentProps<typeof Checkbox>, "className" | "checked">)
);

/** 선택 상태·화살표 포커스·ref·이벤트는 Radix에 남겨 형만 공유한다. */
export function SelectRow({ input, label, checked, active = checked, first = true, previousChecked, expand, aside, className, ...props }: Props) {
  const unavailable = props.disabled || props["aria-disabled"] === true || props["aria-disabled"] === "true";
  const content = input === "radio" ? <Radio {...props as ComponentProps<typeof Radio>} label={label}
    className={cn("min-w-0 flex-1 gap-3 p-3", unavailable && "cursor-not-allowed")}
    onClick={event => {
      if (unavailable) { event.preventDefault(); return; }
      props.onClick?.(event);
    }} /> : <label className={cn("flex min-w-0 cursor-pointer items-center gap-3 p-3", unavailable && "cursor-not-allowed", aside ? "shrink-0" : "flex-1")}>
      <Checkbox {...props as ComponentProps<typeof Checkbox>} checked={checked} />
      {label}
    </label>;
  return <div data-select-row className={cn(
    !first && "border-t", !first && (active || previousChecked ? "border-border" : "border-divider"),
    active ? "bg-muted" : !unavailable && "hover:bg-foreground/[0.03]",
    className,
  )}>
    <div className="flex min-w-0 items-center">{content}{aside && <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3"><Slot.Root className="text-foreground h-auto min-w-0 flex-1 justify-start gap-3 rounded p-0 text-left whitespace-normal">{aside}</Slot.Root></div>}</div>
    {expand}
  </div>;
}
