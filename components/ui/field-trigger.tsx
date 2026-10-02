"use client";

import { ChevronDown } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { fieldClass, fieldWidthClass, type FieldWidth } from "./input";

/** 필터와 Select가 같은 형을 쓰고, 열림·선택·포커스는 Radix가 소유한다. */
export function FieldTrigger({ asChild, active, size = "md", width, className, children, ...props }: ComponentPropsWithRef<"button"> & {
  asChild?: boolean;
  active?: boolean;
  size?: "md" | "sm";
  width?: FieldWidth;
}) {
  const Root = asChild ? Slot.Root : "button";
  return <Root type="button" className={cn(
    fieldClass, "group inline-flex cursor-pointer items-center justify-between gap-1.5 whitespace-nowrap hover:bg-primary-foreground",
    size === "md" ? "h-9" : "h-7 px-2 text-xs",
    width === undefined ? undefined : fieldWidthClass[width],
    "[&>span]:min-w-0 [&>span]:truncate data-[placeholder]:text-muted-foreground",
    "disabled:bg-accent disabled:text-muted-foreground disabled:hover:bg-accent disabled:cursor-not-allowed",
    "aria-disabled:bg-accent aria-disabled:text-muted-foreground aria-disabled:hover:bg-accent aria-disabled:cursor-not-allowed",
    active === undefined ? undefined : active ? "border-foreground text-foreground font-medium" : "border-border text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
    className,
  )} {...props}>
    <Slot.Slottable>{children}</Slot.Slottable>
    <ChevronDown aria-hidden className={cn(size === "md" ? "size-4" : "size-3.5", "shrink-0 group-data-[state=open]:rotate-180")} />
  </Root>;
}
