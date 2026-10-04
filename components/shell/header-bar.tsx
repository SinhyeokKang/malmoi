import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// 높이 44(2026-10-04 헤더 44) — 헤더 요소의 세로 중심(28)과 패널 시작(56)은 셸이 위 여백을 6으로 줄여 그대로다.
// 좌우 묶음의 폭이 달라도 가운데 슬롯이 헤더 중앙에 서야 한다.
export function HeaderBar({ start, center, end, className }: {
  start: ReactNode;
  center?: ReactNode;
  end: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-1", className)}>
      <div className="justify-self-start">{start}</div>
      <div className="justify-self-center">{center}</div>
      <div className="justify-self-end">{end}</div>
    </header>
  );
}
