"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as Primitive, Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { fieldClass } from "./input";

/**
 * **Radix Select다** (2026-09-13 사용자 — shadcn 형으로 리워크). 그 전에는 native `<select>`였고
 * 근거가 "모바일에서 OS 피커가 붙는 쪽이 낫다"였는데, **핸드오프가 트리거의 글리프를 `chevron-down`
 * 16 · `#737373` · 오른쪽 끝으로 못 박는다** — native는 화살표를 브라우저가 그려 그 값을 맞출 수
 * 없다. 대가는 모바일 OS 피커이고, 이 앱은 셸이 데스크톱 폭을 전제한다.
 *
 * ⚠️ **포커스 트랩·타이핑 점프·`aria-*`는 Radix가 든다** — 직접 만들지 않는다 (DESIGN §7).
 * 우리가 얹는 것은 형뿐이고, 그 형은 `DropdownMenu`와 같은 값을 쓴다(팝오버가 둘로 갈리지 않게).
 *
 * ⚠️ **트리거가 `fieldClass`를 지난다** — `Input`·`Textarea`와 같은 테두리·radius·글자 크기여야
 * 한 줄에 선 컨트롤이 어긋나지 않는다 (`input.tsx`의 높이 36 주석과 같은 규칙).
 *
 * ⚠️ **폭은 호출부가 준다.** native `<select>`는 내용이 폭을 정했지만 트리거는 `<button>`이라
 * 내용만큼만 넓다 — 목록 안에서 값에 따라 폭이 흔들리는 자리는 `w-*`를 명시한다.
 */
export const Select = Primitive.Root;
export const SelectValue = Primitive.Value;

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        fieldClass,
        "flex h-9 cursor-pointer items-center justify-between gap-2 whitespace-nowrap",
        /*
          ⚠️ **값을 자르는 규칙이 트리거에 있어야 한다.** native `<select>`는 브라우저가 알아서
          잘랐지만 트리거는 `<button>`이고, 안의 값 span은 flex item 기본 `min-width:auto`라
          **min-content까지만** 줄어든다 — 공백 없는 긴 값(브랜치명·네임스페이스)에서 min-content가
          문자열 전체라 고정폭 트리거를 뚫고 `shrink-0`인 글리프를 밀어낸다.
        */
        "[&>span]:min-w-0 [&>span]:truncate",
        "data-[placeholder]:text-muted-foreground disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      {/*
        ⚠️ **`{children}`을 `Slot.Slottable`로 감싼다** — 아래 글리프가 형제라 `asChild`가 오면
        Slot이 "자식이 둘"로 보고 던진다 (`DropdownMenuItem`과 같은 지뢰, POSTMORTEM 2026-09-09).
      */}
      <Slot.Slottable>{children}</Slot.Slottable>
      {/* ⚠️ **글리프를 `Icon`으로 감싼다** — 그래야 Radix가 `aria-hidden`과 포인터 이벤트를 든다. */}
      <Primitive.Icon asChild>
        <ChevronDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </Primitive.Icon>
    </Primitive.Trigger>
  );
}

/**
 * ⚠️ **`position="popper"` + `--radix-select-trigger-width`가 짝이다.** 기본값(`item-aligned`)은
 * 고른 항목을 트리거 위에 겹쳐 띄워 목록 행 안에서 열면 행을 가린다.
 */
export function SelectContent({
  className,
  position = "popper",
  sideOffset = 4,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        position={position}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover border-border z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-x-hidden overflow-y-auto rounded-lg border py-1 shadow-md",
          className,
        )}
        {...props}
      >
        <Primitive.Viewport>{children}</Primitive.Viewport>
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        "mx-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none",
        "hover:bg-accent focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <Primitive.ItemText>{children}</Primitive.ItemText>
      {/* 체크 자리는 켜질 때만 그려지고 `ml-auto`가 오른쪽으로 민다 (`DropdownMenuCheckboxItem`과 같은 형). */}
      <Primitive.ItemIndicator className="ml-auto">
        <Check className="size-4" aria-hidden />
      </Primitive.ItemIndicator>
    </Primitive.Item>
  );
}
