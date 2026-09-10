import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 상태 배지 — 색 체계는 DESIGN §6.2가 정본이다. **아이콘을 넣지 않는다** (§6.8): 배지는 텍스트다.
 *
 * ⚠️ **`translated`에 해당하는 variant가 없다.** 가장 흔한 상태가 가장 조용해야 한다 — 번역된 셀에는
 * 배지가 붙지 않는다.
 */
/**
 * ⚠️ **모양이 알약이다** (8-3, 시안 `SolidBadge`) — `rounded`(4px)에서 `rounded-full`로 base를 바꿨다.
 * 시안의 배지가 전부 알약이라 variant마다 갈라 두면 화면에서 모서리 둘이 섞인다.
 */
const badge = cva("inline-flex items-center rounded-full px-2 py-0.5 text-xs", {
  variants: {
    variant: {
      // ⚠️ **muted 표면 위에 놓지 않는다** — 이 색은 흰 배경에서 4.75:1이고 `--muted` 위에서는
      // 4.34:1로 AA 미달이다 (§2.2). 배지가 사는 곳은 표 셀·목록 행(흰 배경)이고, 표 헤더처럼
      // muted인 자리에 놓을 일이 생기면 호출부가 `text-foreground/60`으로 덮는다.
      muted: "text-muted-foreground",
      warning: "bg-amber-100/80 text-amber-800",
      // 배경 없음 — orphaned는 "삭제됨"이 아니라 되돌릴 수 있는 상태다 (§6.2).
      danger: "text-destructive",
      /**
       * 회색 알약 (8-3 — 목록 행의 상태 · 제목 옆 총계). ⚠️ **새 raw 색이 아니다**:
       * `--foreground`의 알파라 §6.2의 "등재된 것이 전부" 규칙 밖이다.
       *
       * ⚠️ **검정 채움(`solid`)을 만들지 않았다** — 시안 개정이 역할을 배지에서 메타 평문으로
       * 내리면서 소비자가 0이 됐다. 쓰는 곳이 생길 때 만든다.
       */
      neutral: "bg-foreground/5 text-foreground",
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
