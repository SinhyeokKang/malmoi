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
    // ⚠️ **provider를 스스로 든다.** Radix의 Root는 provider가 없으면 **던지고**, 이 툴팁은 접힌
    // 사이드바에서만 렌더되므로 그 예외는 "접기를 누르면 셸이 죽는다"로 나타난다 — 접힘이
    // `localStorage`에 남아 다음 방문에도 같은 자리에서 죽는다. 중첩은 Radix가 허용하므로 셸이
    // 바깥에 `TooltipProvider`를 한 번 더 걸어 지연을 공유해도 무해하다.
    <Primitive.Provider delayDuration={200}>
      <Primitive.Root>
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
    </Primitive.Provider>
  );
}

/**
 * 여러 툴팁이 **지연을 공유**하게 하려면 바깥에 한 번 건다 — 하나를 열어 둔 채 옆 항목으로 가면
 * 지연 없이 바뀐다. **없어도 동작한다**(위 `Tooltip`이 자기 provider를 든다) — 이건 최적화다.
 */
export const TooltipProvider = Primitive.Provider;
