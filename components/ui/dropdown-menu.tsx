"use client";

import { Check } from "lucide-react";
import { DropdownMenu as Primitive, Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { ListRow } from "./list-row";
import { useImeGuard } from "./use-ime-guard";

/**
 * 사용자 메뉴·프로젝트 전환 (DESIGN §6.4).
 *
 * ⚠️ **포커스 트랩·Esc·`aria-*`는 Radix가 든다** — 직접 만들지 않는다 (§7). 우리가 얹는 것은 형뿐이다.
 */
export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;

/**
 * ⚠️ **뷰포트에서 8px 안쪽에 둔다**(`collisionPadding`, 2026-10-02 — 번역 값 패널의 언어 메뉴가 오른쪽 화면 밖으로 일부 열렸다). Radix는 기본으로
 * 충돌을 피하지만 여백이 0이라 화면 끝에 딱 붙거나, 정렬이 트리거 폭보다 넓은 메뉴를 끝 쪽으로 밀어냈다. 높이 상한
 * (`--radix-dropdown-menu-content-available-height`)도 이 여백을 뺀 값이라 긴 목록이 아래 끝에 붙지 않는다.
 * ⚠️ **오른쪽 끝에 선 트리거는 호출부가 `align="end"`를 준다** — 시작 정렬이면 트리거보다 넓은 메뉴가 화면 끝 쪽으로 자란다.
 */
export function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  collisionPadding = 8,
  children,
  onEscapeKeyDown,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  const ime = useImeGuard();
  return (
    <Primitive.Portal>
      <Primitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn("bg-popover border-border z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-60 max-w-md overflow-x-hidden overflow-y-auto rounded-lg border py-1 shadow-md", className)}
        {...props}
        onCompositionStart={ime.onCompositionStart}
        onCompositionEnd={ime.onCompositionEnd}
        // 조합 중 Esc는 조합 취소다 — Radix가 Esc를 document capture에서 들어 입력의 stopPropagation이 안 닿는다(C9).
        onEscapeKeyDown={(event) => {
          if (ime.blocks(event)) { event.preventDefault(); return; }
          onEscapeKeyDown?.(event);
        }}
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
  selected,
  children,
  ...props
}: ComponentProps<typeof Primitive.Item> & {
  /**
   * 단일 선택 메뉴의 현재 값. ⚠️ **받는 항목은 `menuitemradio` + `aria-checked`다** (audit #36) — 전엔 `bg-muted` + 체크
   * 글리프라는 시각 표시뿐이라 스크린리더는 어느 필터가 켜졌는지 몰랐다. **안 받는 항목**(프리셋·`Custom…`처럼 값이
   * 아니라 동작인 것)은 `menuitem` 그대로다 — `false`와 `undefined`가 다른 뜻이다.
   */
  selected?: boolean;
}) {
  return (
    <Primitive.Item
      // ⚠️ 키째로 빼야 한다 — `role={undefined}`를 넘기면 Radix가 세운 `menuitem`까지 지운다.
      {...(selected === undefined ? {} : { role: "menuitemradio", "aria-checked": selected })}
      className={cn(
        "mx-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none",
        "hover:bg-accent focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
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
 * **다중 선택 항목** (8-4 — DESIGN §6.4). 번역 화면의 `Select locales`가 유일한 소비자다.
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
        "hover:bg-accent focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
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

/**
 * **결과 목록 행** (attention-inbox T8a — DESIGN §6.4). 동작·필터 메뉴의 `DropdownMenuItem`(inset `mx-1 rounded` + `bg-accent`)과 달리
 * 전역 검색 option과 같은 형이다 — `ListRow` 전폭 `px-4`, 두 줄(제목 + 보조줄) + aside. 소비자는 헤더 Inbox다.
 *
 * ⚠️ **활성 면은 Radix `data-highlighted` 하나다** — 포인터와 키보드가 같은 상태를 칠해 칠해진 행이 늘 하나다(검색 C16). 그래서 hover 면을
 * 끄고(`hoverFill={false}`) `ListRow`의 `focus-visible` 링도 끈다 — 로빙 포커스의 표시는 활성 면이다(`CommandItem`의 `tabIndex={-1}`와 같은 결론).
 * 클래스는 리터럴로 쓴다 — 상수를 접두로 붙인 `data-[…]:` 조립은 Tailwind가 CSS를 만들지 않는다(`tabs.tsx` 머리 주석).
 *
 * ⚠️ **늘 `asChild`이고 안은 `ListRow` 하나다** — menuitem 역할이 행 요소(`href`면 `<a>`, 아니면 `<button>`) 자체에 선다. 형제를 붙이면
 * Slot이 던진다(POSTMORTEM 2026-09-09 — `slottable-item.test.ts`가 이 형을 고정한다).
 */
export function DropdownMenuRow({
  href,
  icon,
  title,
  description,
  aside,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof Primitive.Item>, "asChild" | "children" | "title" | "className"> & {
  href?: string;
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const target = href === undefined ? { as: "button" as const } : { href };
  return (
    <Primitive.Item asChild {...props}>
      <ListRow {...target} hoverFill={false} icon={icon} title={title} description={description} aside={aside} className={cn("cursor-pointer py-2.5 text-sm outline-none focus-visible:ring-0 data-[highlighted]:bg-foreground/[0.07] data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)}>{children}</ListRow>
    </Primitive.Item>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <Primitive.Separator className={cn("border-border my-1 border-t", className)} />;
}

export function DropdownMenuLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <Primitive.Label className={cn("text-muted-foreground px-3 py-1.5 text-xs", className)}>{children}</Primitive.Label>;
}
