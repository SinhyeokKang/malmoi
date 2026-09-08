"use client";

import { Check } from "lucide-react";
import { DropdownMenu as Primitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 사용자 메뉴·프로젝트 전환 (DESIGN §6.4).
 *
 * ⚠️ **포커스 트랩·Esc·`aria-*`는 Radix가 든다** — 직접 만들지 않는다 (§7). 우리가 얹는 것은 형뿐이다.
 */
export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;

export function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("bg-popover border-border min-w-60 max-w-md rounded-lg border py-1 shadow-md", className)}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  selected = false,
  children,
  ...props
}: ComponentProps<typeof Primitive.Item> & { selected?: boolean }) {
  return (
    <Primitive.Item
      className={cn(
        "mx-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none",
        "hover:bg-accent focus:bg-accent",
        selected && "bg-muted",
        className,
      )}
      {...props}
    >
      {children}
      {selected && <Check className="ml-auto size-4" aria-hidden />}
    </Primitive.Item>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <Primitive.Separator className={cn("border-border my-1 border-t", className)} />;
}

export function DropdownMenuLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <Primitive.Label className={cn("text-muted-foreground px-3 py-1.5 text-xs", className)}>{children}</Primitive.Label>;
}
