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
/**
 * 레이블은 위치와 무관하게 500으로 통일한다 (2026-09-12 사용자).
 *
 * ⚠️ **한 글자면 정원이다** (2026-09-11 사용자). `min-w-5`가 높이(`text-xs` 16 + `py-0.5` 4 = 20)와
 * 같고 `justify-center`가 그 안에 글자를 앉힌다 — 좌우 padding만으로는 한 글자에서도 가로가 더 길어
 * 개수 배지가 알약처럼 늘어졌다. **padding을 `px-1.5`로 줄여야** 한 글자에서 min-w가 이긴다
 * (`px-2`면 8+7+8=23으로 20을 넘는다). 여러 글자는 그대로 알약이 된다.
 */
const badge = cva("inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      // ⚠️ **muted 표면 위에 놓지 않는다** — 이 색은 흰 배경에서 4.75:1이고 `--muted` 위에서는
      // 4.34:1로 AA 미달이다 (§2.2). 배지가 사는 곳은 표 셀·목록 행(흰 배경)이고, 표 헤더처럼
      // muted인 자리에 놓을 일이 생기면 호출부가 `text-foreground/60`으로 덮는다.
      muted: "text-muted-foreground",
      warning: "bg-amber-100/80 text-amber-800",
      /**
       * 초록 (2026-09-11 사용자 — 목록 행의 `Active`).
       *
       * ⚠️ **§6.2가 "성공에 초록을 쓰지 않는다"고 적은 자리와 축이 다르다.** 그 규칙은 **Alert**의
       * `success`(Publish 결과)에 대한 것이고 근거가 "성공은 조용하다"였다 — 읽고 나면 사라지는
       * 일회성 결과여서다. 여기 `Active`는 **행마다 늘 있는 지속 상태**이고, 같은 행의 amber 셋과
       * **한눈에 갈려야** 목록을 훑을 때 손볼 프로젝트가 튀어나온다.
       *
       * ⚠️ amber와 같은 형이다(`-100/80` 배경 + `-800` 글자) — 채도를 맞춰야 둘이 같은 계열로 읽힌다.
       */
      success: "bg-green-100/80 text-green-800",
      // 배경 없음 — orphaned는 "삭제됨"이 아니라 되돌릴 수 있는 상태다 (§6.2).
      danger: "text-destructive",
      /**
       * 채운 붉은 알약 (2026-09-22 — Sources 시안 `1c`의 사라진 언어).
       *
       * ⚠️ **`danger`와 축이 다르다.** 그쪽은 같은 행의 다른 배지들과 나란히 서는 표식이라 배경을
       * 안 들었고, 이쪽은 **비고 열 전체가 그 한 알약**이라 amber `warning`과 같은 무게로 서야
       * 검토 필요와 사라짐이 한눈에 갈린다. `red-700`(#b91c1c)은 `destructive`(#dc2626)보다
       * 한 단계 어둡고, 시안이 두 색을 구별해 쓴다(실패 글자 vs 사라짐 알약).
       */
      missing: "gap-1.5 bg-red-700/10 text-red-700",
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
