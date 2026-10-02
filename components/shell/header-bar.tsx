import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// 좌우 묶음의 폭이 달라도 가운데 슬롯이 헤더 중앙에 서야 한다.
export function HeaderBar({ start, center, end, className }: {
  start: ReactNode;
  center?: ReactNode;
  end: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-1", className)}>
      <div className="justify-self-start">{start}</div>
      <div className="justify-self-center">{center}</div>
      <div className="justify-self-end">{end}</div>
    </header>
  );
}
