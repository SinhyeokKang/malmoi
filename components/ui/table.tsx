import type { HTMLAttributes, ReactNode, ThHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * 번역 표 (DESIGN §6.1).
 *
 * ⚠️ **가로 스크롤은 이 컨테이너 안에서만** 일어난다 — 페이지 본문이 가로로 밀리면 사이드바까지
 * 따라 움직인다. 903행에서 `thead`가 sticky여야 로케일 열이 무엇인지 계속 보인다.
 */
export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      // muted 표면 위라 `text-muted-foreground`를 쓰지 않는다 — 대비가 4.34:1로 미달이다 (§2.2).
      className={cn("bg-muted/50 text-foreground/60 sticky top-0 px-4 py-2 text-left font-medium", className)}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("border-border border-t px-4 py-3 align-top", className)} {...props}>
      {children}
    </td>
  );
}

export function Tr({ className, children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("hover:bg-muted/30", className)} {...props}>
      {children}
    </tr>
  );
}
