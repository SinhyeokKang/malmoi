import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 상태 배지 — 색 체계는 DESIGN §6.2가 정본이다. **아이콘을 넣지 않는다** (§6.8): 배지는 텍스트다.
 *
 * ⚠️ **`translated`에 해당하는 variant가 없다.** 가장 흔한 상태가 가장 조용해야 한다 — 번역된 셀에는
 * 배지가 붙지 않는다.
 */
const badge = cva("inline-flex items-center rounded px-1.5 py-0.5 text-xs", {
  variants: {
    variant: {
      // muted 표면 위에서도 읽혀야 해서 `text-muted-foreground`가 아니다 (§2.2).
      muted: "text-foreground/60",
      warning: "bg-amber-100/80 text-amber-800",
      // 배경 없음 — orphaned는 "삭제됨"이 아니라 되돌릴 수 있는 상태다 (§6.2).
      danger: "text-destructive",
    },
  },
  defaultVariants: { variant: "muted" },
});

export function Badge({
  variant,
  className,
  children,
}: VariantProps<typeof badge> & { className?: string; children: ReactNode }) {
  return <span className={cn(badge({ variant }), className)}>{children}</span>;
}
