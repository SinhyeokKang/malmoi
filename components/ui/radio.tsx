"use client";

import { RadioGroup as Primitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * **Radix RadioGroup이다** (2026-09-13 사용자 — Radix 우선). 그 전에는 native `<input type="radio">`
 * 였는데, **핸드오프가 지시자를 16 원 · 비선택 테두리 `#d4d4d4` · 선택 테두리 `#0a0a0a` + 안쪽 점
 * 8로 못 박는다** — native는 그 셋을 브라우저가 그려 OS마다 다른 모양이 나온다.
 *
 * ⚠️ **화살표 이동은 그대로 공짜다** — native가 주던 roving focus를 Radix Root가 든다. 잃는 것은
 * 없고, `role="radiogroup"`과 `aria-checked`가 오히려 명시적으로 붙는다.
 *
 * ⚠️ **`Radio`는 `RadioGroup` 안에서만 선다.** Radix `Item`이 Root의 컨텍스트를 읽으므로 홀로
 * 쓰면 던진다 — 목록을 그리는 쪽이 `RadioGroup`을 감싸고 `aria-label`로 그룹 이름을 준다.
 *
 * ⚠️ **`asChild`로 `<ul>`에 얹지 않는다** (2026-09-13 실측). Radix가 그 태그의 role을 `radiogroup`으로
 * **덮어써서** `<li>`들이 부모 list를 잃은 고아 listitem이 된다 — "list, N items" 안내가 사라지고
 * axe가 `aria-required-children`으로 잡는다. Root가 div 한 겹을 세워도 라디오는 그 후손이라 그대로
 * 소유되고, **리스트와 radiogroup이 둘 다 산다.**
 *
 * ⚠️ **`fieldset`/`legend`와 겹쳐 쓰지 않는다** — 둘 다 그룹이라 스크린리더가 그룹을 두 번 읽는다.
 * 이름은 `aria-label`이나 `aria-labelledby` **한 쪽만** 준다 (`naming.tsx`가 그 이유로 `fieldset`을 버렸다).
 *
 * className은 label 루트의 gap·행 배치를 덮고, native/ref/data/event 속성은 Radix Item에 남는다.
 * Item과 Indicator의 치수·포커스 링은 내부 고정이다.
 */
export const RadioGroup = Primitive.Root;

export function Radio({
  label,
  className,
  ...props
}: ComponentProps<typeof Primitive.Item> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 text-sm", className)}>
      <Primitive.Item
        className={cn(
          "bg-background flex size-4 shrink-0 items-center justify-center rounded-full border border-gray-light",
          "data-[state=checked]:border-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
          "focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none data-[state=checked]:focus-visible:border-ring",
        )}
        {...props}
      >
        {/* 안쪽 점 8 — 테두리와 같은 색이라 선택된 원이 하나의 과녁으로 읽힌다 (핸드오프 1a). */}
        <Primitive.Indicator className="bg-foreground size-2 rounded-full" />
      </Primitive.Item>
      {label}
    </label>
  );
}

/**
 * Radix 선택·roving focus를 그대로 쓰되 **형만 자기 것으로 얹는** 소비자가 든다.
 *
 * 소비자 **둘**: `SegmentedControl`(세그먼트) · 초대 모달의 Role 카드(2026-09-19 — 지시자 없이
 * 테두리가 선택을 말한다). ⚠️ **둘 다 포커스 링을 자기가 든다** — `Radio`와 달리 지시자 원이 없어
 * 링이 빠지면 키보드로 어디 있는지 알 수 없다 (§7).
 */
export const RadioGroupItem = Primitive.Item;
