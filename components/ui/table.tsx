import type { HTMLAttributes, ReactNode, ThHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * 번역 표 (DESIGN §6.1).
 *
 * ⚠️ **가로 스크롤은 이 컨테이너 안에서만** 일어난다 — 페이지 본문이 가로로 밀리면 사이드바까지
 * 따라 움직인다. 903행에서 `thead`가 sticky여야 로케일 열이 무엇인지 계속 보인다.
 *
 * ⚠️ **세로도 이 컨테이너가 든다 (`h-full overflow-auto`).** `sticky top-0`은 **가장 가까운 스크롤
 * 컨테이너**를 기준으로 붙으므로, 세로 스크롤을 바깥이 들면 헤더가 붙을 대상이 없어 그냥 흘러간다.
 * 높이는 부모(`min-h-0 flex-1`)가 정해 준다.
 */
export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="h-full min-w-0 overflow-auto">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      // muted 표면 위라 `text-muted-foreground`를 쓰지 않는다 — 대비가 4.34:1로 미달이다 (§2.2).
      // ⚠️ **`sticky`에는 `z`가 함께 있어야 한다** — 없으면 스크롤할 때 셀 내용(특히 입력의 포커스 링)이
      // 헤더 위로 그려진다. 903행 표에서 헤더는 늘 겹침 대상이다.
      className={cn(
        "bg-muted/50 text-foreground/60 sticky top-0 z-10 px-4 py-2 text-left font-medium",
        className,
      )}
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
