"use client";

import { Check } from "lucide-react";
import { DropdownMenu as Primitive, Slot } from "radix-ui";
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

/**
 * ⚠️ **`{children}`을 `Slot.Slottable`로 감싼다.** 호출부가 `asChild`를 주면 Radix Slot이 자식에
 * props를 얹는데, Slot은 **정확히 하나의 엘리먼트**만 받는다 — 아래 `Check`가 형제로 붙는 순간 자식이
 * 둘이 되어 ``Primitive.div failed to slot onto its children``으로 **던지고, 그 컴포넌트를 든 트리가
 * 통째로 죽는다.**
 *
 * 실측 (2026-09-09): 사이드바의 프로젝트 스위처를 **한 번 열면** 셸이 "This page couldn't load"로
 * 죽었다 — `asChild` + `selected`가 그 조합이고 `add099a`(6a ship 2)부터 프로덕션에 있었다. 게이트
 * 셋이 전부 green이었다: 렌더되는 것과 **클릭했을 때 사는 것**은 다른 사실이다
 * (POSTMORTEM 2026-09-08의 툴팁 provider와 같은 모양).
 *
 * `Slottable`은 "이 자식이 슬롯 대상"을 알려 주므로 형제가 허용된다. `Check`는 슬롯된 엘리먼트(예:
 * `<Link>`) 안으로 들어가고, 그 엘리먼트가 아래 `flex`를 받으므로 `ml-auto`가 그대로 동작한다.
 * `components/__tests__/slottable-item.test.ts`가 이 조합을 상시로 센다.
 */
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
      <Slot.Slottable>{children}</Slot.Slottable>
      {selected && <Check className="ml-auto size-4" aria-hidden />}
    </Primitive.Item>
  );
}

/**
 * **다중 선택 항목** (8-4 — design §9). 번역 화면의 `Select locales`가 유일한 소비자다.
 *
 * ⚠️ **`DropdownMenuItem` + `selected`로는 안 된다.** 그쪽은 `bg-muted` + `<Check>`라는 **시각
 * 표시만** 붙어 접근성 트리에 상태가 없고, Radix `Item`은 선택 시 메뉴를 **닫는다** — 다중 선택에서
 * 항목마다 메뉴를 다시 열게 된다. `CheckboxItem`은 `role="menuitemcheckbox"`와 `aria-checked`를
 * Radix가 준다.
 *
 * ⚠️ **`onSelect`의 `preventDefault()`를 프리미티브가 든다.** 소비자마다 기억하게 하면 하나가
 * 빠지고, 그 하나는 "고를 때마다 메뉴가 닫힌다"로만 드러난다.
 *
 * ⚠️ **`{children}`을 `Slot.Slottable`로 감싼다** — 아래 지시자가 형제라 `asChild`가 오면 Slot이
 * 던진다 (`DropdownMenuItem`과 같은 이유, POSTMORTEM 2026-09-09).
 *
 * ⚠️ **포커스 링 셋을 여는 태그에 리터럴로 적는다** (§7) — cva 베이스나 공유 상수에 모으면
 * `focus-ring.test.ts`가 이 파일을 통째로 못 본다.
 */
export function DropdownMenuCheckboxItem({
  className,
  children,
  onSelect,
  ...props
}: ComponentProps<typeof Primitive.CheckboxItem>) {
  return (
    <Primitive.CheckboxItem
      className={cn(
        "mx-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none",
        "hover:bg-accent focus:bg-accent",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      onSelect={(event) => {
        event.preventDefault();
        onSelect?.(event);
      }}
      {...props}
    >
      <Slot.Slottable>{children}</Slot.Slottable>
      {/* 체크 자리는 항상 비워 둔다 — 지시자가 켜질 때만 그려지지만 폭은 `ml-auto`가 오른쪽에 민다. */}
      <Primitive.ItemIndicator className="ml-auto">
        <Check className="size-4" aria-hidden />
      </Primitive.ItemIndicator>
    </Primitive.CheckboxItem>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <Primitive.Separator className={cn("border-border my-1 border-t", className)} />;
}

export function DropdownMenuLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <Primitive.Label className={cn("text-muted-foreground px-3 py-1.5 text-xs", className)}>{children}</Primitive.Label>;
}
