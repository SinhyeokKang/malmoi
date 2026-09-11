import type * as React from "react";
import type { HTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// shadcn/ui new-york-v4 Table 기반. 기존 소비자의 스크롤 계약은 scrollable 기본값으로 유지한다.
// 원본: https://ui.shadcn.com/r/styles/new-york-v4/table.json

function Table({ className, scrollable = true, ...props }: React.ComponentProps<"table"> & { scrollable?: boolean }) {
  const table = <table data-slot="table" className={cn("w-full border-collapse caption-bottom text-sm", className)} {...props} />;
  // translations는 PanelBody가 스크롤을 소유하므로 중첩 스크롤 컨테이너를 만들지 않는다.
  return scrollable ? <div className="h-full min-w-0 overflow-auto">{table}</div> : table;
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};

// 기존 화면의 치수·sticky 헤더를 유지한다.
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
