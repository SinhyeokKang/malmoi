import type { ComponentPropsWithRef } from "react";

import { cn } from "@/lib/utils";

/**
 * **목록·트리의 누를 수 있는 행** (번역 작업 화면 — 핸드오프 `2a`·`2c`). 행 전체가 한 버튼이다.
 *
 * ⚠️ **선택은 배경만 바꾸고 굵기를 주지 않는다** — 선택 `bg-foreground/[0.07]` · hover `[0.03]`(`sidebar.tsx`와 같은 규칙).
 *    굵기는 호출부가 **계층**(소스 500 · 네임스페이스 400)에만 준다.
 * ⚠️ **링이 `ring-inset`이다** — 스크롤 영역 안의 전폭 행이라 바깥 링은 형제 행과 스크롤 경계에 잘린다.
 * ⚠️ `aria-current`로 선택을 말한다 — 색만으로 말하지 않는다(DESIGN §7).
 */
export function ListItemButton({ selected = false, className, type = "button", ...props }: ComponentPropsWithRef<"button"> & { selected?: boolean }) {
  return (
    <button
      type={type}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "w-full text-left focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
        selected ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.03]",
        className,
      )}
      {...props}
    />
  );
}
