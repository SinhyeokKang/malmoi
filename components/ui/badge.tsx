import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 배지의 모양·색 프리셋 — 상태는 StatusBadge가 정하고 색 체계는 DESIGN §6.2가 정본이다. **아이콘을 넣지 않는다** (§6.8): 배지는 텍스트다.
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
 * ⚠️ **한 글자면 정원이다** (2026-09-11 사용자). `min-w-5`가 높이(`text-2xs` 16 + `py-0.5` 4 = 20 — 2026-09-30부터 12px, `globals.css`)와
 * 같고 `justify-center`가 그 안에 글자를 앉힌다 — 좌우 padding만으로는 한 글자에서도 가로가 더 길어
 * 개수 배지가 알약처럼 늘어졌다. **padding을 `px-1.5`로 줄여야** 한 글자에서 min-w가 이긴다
 * (`px-2`면 8+7+8=23으로 20을 넘는다). 여러 글자는 그대로 알약이 된다.
 */
const badge = cva("inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-2xs font-medium", {
  variants: {
    variant: {
      // ⚠️ **muted 표면 위에 놓지 않는다** — 이 색은 흰 배경에서 4.75:1이고 `--muted` 위에서는
      // 4.34:1로 AA 미달이다 (§2.2). 배지가 사는 곳은 표 셀·목록 행(흰 배경)이고, 표 헤더처럼
      // muted인 자리에 놓을 일이 생기면 호출부가 `text-foreground/60`으로 덮는다.
      text: "text-muted-foreground",
      "soft-amber": "bg-warning-soft text-warning-soft-foreground",
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
      "soft-green": "bg-success-soft text-success-foreground",
      /**
       * 채운 붉은 알약 — **danger 톤의 배지는 이것 하나다** (DESIGN §2.4 · D3②). 실패 알약(Logs 결과 · Sources 상태) · 사라진 언어 ·
       * 다른 리포가 같은 면이다. 면·글자는 붉은 면 조합(`bg-destructive/8 text-destructive` — 버튼 `danger`·아이콘 칸과 같다, §2.3).
       *
       * ⚠️ **면 없는 붉은 글자(`danger` variant)를 2026-10-01에 지웠다** — 소비자가 로케일 배지 하나였고, 같은 사라짐이 Sources에서는
       * 이 면으로 서서 한 상태가 두 모양이었다. ⚠️ **글리프 간격(`gap-1.5`)도 지웠다** — 배지 안에는 글리프를 넣지 않는다(§2.4·§6.8).
       * 국기는 상태 글리프가 아니라 면제이고, 그 간격은 로케일 배지가 `gap-1`로 든다.
       */
      "soft-red": "bg-destructive/8 text-destructive",
      /**
       * 회색 알약 (8-3 — 목록 행의 상태 · 제목 옆 총계). ⚠️ **새 raw 색이 아니다**:
       * `--foreground`의 알파라 §6.2의 "등재된 것이 전부" 규칙 밖이다.
       *
       * ⚠️ **검정 채움(`solid`)을 만들지 않았다** — 시안 개정이 역할을 배지에서 메타 평문으로
       * 내리면서 소비자가 0이 됐다. 쓰는 곳이 생길 때 만든다.
       */
      "soft-neutral": "bg-foreground/5 text-foreground",
    },
  },
  defaultVariants: { variant: "text" },
});

export function Badge({
  variant,
  className,
  children,
}: VariantProps<typeof badge> & { className?: string; children: ReactNode }) {
  return <span className={cn(badge({ variant }), className)}>{children}</span>;
}
