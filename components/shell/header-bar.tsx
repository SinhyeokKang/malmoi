import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// 높이 44(2026-10-04 헤더 44) — 헤더 요소의 세로 중심(28)과 패널 시작(56)은 셸이 위 여백을 6으로 줄여 그대로다.
// 좌우 묶음의 폭이 달라도 가운데 슬롯이 헤더 중앙에 서야 한다.
// `compact`(공개 셸 — responsive-public PT1a · 앱 셸 — responsive-app AT1a): `lg` 미만은 한 줄 flex가 되고 가운데 슬롯이 오른쪽 묶음 앞에 붙는다(gap 12).
// DOM 순서가 곧 보이는 순서라 Tab 순서도 같다. 랜딩 목업은 주지 않는다 — 이 토큰은 뷰포트 `max-lg:`라 바깥 페이지 폭을 따른다. 목업은 같은 변형을
// 목업 루트 컨테이너 변형(`@max-[64rem]/mockup:`, 가운데 칸 `ml-auto`는 자식 변형)으로 `className`에 직접 든다(`components/landing/mockup/app-frame.tsx`).
export function HeaderBar({ start, center, end, compact = false, className }: {
  start: ReactNode;
  center?: ReactNode;
  end: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-1", compact && "max-lg:flex max-lg:gap-3", className)}>
      <div className="justify-self-start">{start}</div>
      <div className={compact ? "justify-self-center max-lg:ml-auto" : "justify-self-center"}>{center}</div>
      <div className="justify-self-end">{end}</div>
    </header>
  );
}
