"use client";

import { createContext, useContext, useState, type ComponentProps } from "react";
import { Tabs as Primitive } from "radix-ui";

import { SegmentBody, type SegmentContent } from "@/components/ui/segmented-control";
import { SEGMENT, SELECTED, TRACK, UNSELECTED } from "@/components/ui/segment";
import { cn } from "@/lib/utils";

/**
 * 탭 — **패널이 딸린** 보기 전환기다. 모양은 `SegmentedControl`과 같은 세그먼트 형(`segment.ts`)이고
 * 역할은 `tablist`/`tab`/`tabpanel`이다.
 *
 * ⚠️ **`SegmentedControl`을 탭으로 쓰지 않는다** — 그것은 `radiogroup`이고 패널 연결이 없다.
 * 선택·roving focus·패널 id 연결(`aria-controls`·`aria-labelledby`)은 Radix가 소유한다.
 *
 * ⚠️ **선택 스타일은 `data-[state=active]:`로 걸지 않는다** — `${SELECTED}`를 접두로 붙인 문자열은 Tailwind가
 * CSS를 만들지 않는데, jsdom 테스트는 class 문자열만 봐서 green이 난다. `Tabs`가 `value` 상태를 들고
 * `SegmentedControl`처럼 같은 상수를 **JS로 조건부** 붙인다.
 *
 * ⚠️ **Radix는 비활성 패널의 내용을 언마운트한다** — 다시 마운트되는 패널은 늦게 오는 값을 한 프레임 비운 채
 * 그린다. 늦게 오는 값은 항상 마운트된 껍데기가 한 번 구독해 패널로 내린다(`forceMount`를 쓰지 않는다).
 * 패널 껍데기(`tabpanel`)는 `hidden`으로 남는다 — 비활성 탭의 `aria-controls`는 그 빈 껍데기를 가리킨다.
 *
 * 선택은 이 컴포넌트가 든다(`defaultValue`) — 소비자는 착지할 때마다 첫 탭으로 시작하고 값을 밖에 남기지 않는다.
 */
const SelectedContext = createContext<string | null>(null);

export function Tabs({ defaultValue, className, children }: {
  defaultValue: string;
  className?: string;
  children: ComponentProps<typeof Primitive.Root>["children"];
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <SelectedContext.Provider value={value}>
      <Primitive.Root value={value} onValueChange={setValue} className={className}>
        {children}
      </Primitive.Root>
    </SelectedContext.Provider>
  );
}

/** 탭 목록(트랙) — 항상 전폭이다. 이름은 필수다: 탭 이름만으로는 "무엇의 탭인가"가 안 드러난다. */
export function TabsList({ label, className, children }: {
  label: string;
  className?: string;
  children: ComponentProps<typeof Primitive.List>["children"];
}) {
  return (
    <Primitive.List aria-label={label} className={cn(TRACK, "flex", className)}>
      {children}
    </Primitive.List>
  );
}

export function TabsTrigger({ value, ...content }: { value: string } & SegmentContent) {
  const selected = useContext(SelectedContext) === value;
  return (
    <Primitive.Trigger
      value={value}
      className={cn(
        "focus-visible:ring-ring flex-1 focus-visible:ring-2 focus-visible:outline-none",
        SEGMENT,
        selected ? SELECTED : UNSELECTED,
      )}
    >
      <SegmentBody {...content} />
    </Primitive.Trigger>
  );
}

/** 패널 — Radix가 탭 이름으로 라벨하고 비활성이면 언마운트한다. */
export function TabsContent({ value, className, children }: {
  value: string;
  className?: string;
  children: ComponentProps<typeof Primitive.Content>["children"];
}) {
  return <Primitive.Content value={value} className={className}>{children}</Primitive.Content>;
}
