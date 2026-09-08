import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** 설정 블록·온보딩 섹션이 이것이다 (DESIGN §6.4). 헤더의 우측 슬롯은 보통 버튼 하나다. */
export function Card({
  title,
  description,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("border-border rounded-lg border", className)}>
      {title !== undefined && (
        <header className="border-border flex items-start justify-between gap-2 border-b px-4 py-3">
          <div>
            {/* 카드 제목에는 아이콘을 붙이지 않는다 (§6.8) — 정보를 안 더한다. */}
            <h2 className="text-sm font-medium">{title}</h2>
            {description !== undefined && (
              <p className="text-muted-foreground mt-1 text-xs">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className="space-y-2 p-4">{children}</div>
    </section>
  );
}
