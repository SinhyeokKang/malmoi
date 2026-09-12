import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 셸 밖 화면 **셋**이 공유하는 320 폼 컬럼 (2026-09-12) — `/signin` · `/invite/[token]` ·
 * `/signin/link/[challenge]`.
 *
 * ⚠️ **셋이 각자 들고 있던 치수를 여기로 모은다.** 같은 골격을 손으로 세 번 적으면 그중 하나가
 * 낡고, 그 어긋남은 세 화면을 나란히 놓기 전에는 안 보인다 (`AuthLayout`이 2열 골격에 대해 한
 * 일과 같다).
 *
 * ⚠️ **간격이 두 단계다** (2026-09-12 사용자): **컬럼 16** · **덩어리 안 8**. 덩어리는 둘이고
 * 각자 래퍼를 든다 — 문구(`AuthHeading`: 제목 + 설명)와 CTA(버튼 + 각주·약관). 컬럼을 균일한
 * 16으로만 두면 "로고 / 제목 / 설명 / 카드 / 버튼"이 **다섯 개의 같은 무게로** 읽혀 무엇이 한
 * 묶음인지 화면이 말하지 않는다.
 */
export function AuthColumn({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex w-[320px] flex-col items-center gap-4", className)}>{children}</div>;
}

/**
 * 제목 + 설명 한 덩어리.
 *
 * ⚠️ **`description`이 선택이다** — `/signin`은 제목 한 줄뿐이다(제품 설명은 랜딩이 맡는다,
 * 8-1b). 없을 때 빈 문단을 그리지 않는다.
 *
 * ⚠️ **`h1`은 셋 다 든다** — `docs/DESIGN.md`가 셸 밖 폼 컬럼에 `text-2xl font-medium`을 요구하고,
 * `/invite/[token]`은 2026-09-12까지 이 칸이 비어 있던 유일한 화면이었다.
 */
export function AuthHeading({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <h1 className="text-center text-2xl font-medium">{title}</h1>
      {description !== undefined && (
        <p className="text-muted-foreground text-center text-sm">{description}</p>
      )}
    </div>
  );
}
