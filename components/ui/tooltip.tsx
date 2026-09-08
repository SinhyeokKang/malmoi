"use client";

import { Tooltip as Primitive } from "radix-ui";
import type { ReactNode } from "react";

/**
 * **접힌 사이드바의 아이콘 라벨에만 쓴다** (DESIGN §6.4·§7).
 *
 * ⚠️ **툴팁이 `aria-label`을 대신하지 않는다** — 접힌 항목은 **둘 다** 든다. 툴팁은 포인터에만 뜨고
 * 스크린리더는 그것을 이름으로 읽지 않는다.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Primitive.Root delayDuration={200}>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          side="right"
          sideOffset={8}
          className="bg-foreground text-background rounded px-2 py-1 text-xs shadow-md"
        >
          {label}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

/** Radix는 provider가 있어야 여러 툴팁이 지연을 공유한다 — 셸 레이아웃이 한 번 감싼다. */
export const TooltipProvider = Primitive.Provider;
