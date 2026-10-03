import type { ReactNode } from "react";
import { TableRow, TableHead, TableCell } from "./table";
import { cn } from "@/lib/utils";

/**
 * Label/value unit; the consumer owns its dl/grid and the meaning of its value.
 *
 * `align="end"`는 값을 오른쪽 끝에 붙이는 시각 옵션이다(`dir` 아님) — 라벨 폭이 고정이라 값의 끝이 한 열로 선다.
 */
export function Fact({ label, children, width, layout = "row", as, className, dimmed = false, align }: {
  label: ReactNode;
  children: ReactNode;
  width?: 96 | 120;
  layout?: "row" | "stacked" | "inline";
  as?: "tr";
  className?: string;
  dimmed?: boolean;
  align?: "end";
}) {
  if (as === "tr") return <TableRow className="h-12 hover:bg-transparent">
    <TableHead scope="row" className="text-gray-dim h-auto w-[104px] px-3.5 py-2.5 align-middle text-xs font-normal">{label}</TableHead>
    <TableCell className="px-3.5 py-2.5 align-middle text-base whitespace-normal">{children}</TableCell>
  </TableRow>;
  return <div className={cn(layout === "stacked" ? "space-y-1" : layout === "inline" ? "flex items-baseline gap-2" : width === 120 ? "contents" : "flex items-baseline gap-3", className)}>
    <dt className={cn("text-gray-dim text-xs", width === 96 && "w-24 shrink-0", width === 120 && "w-[120px]")}>{label}</dt>
    <dd className={cn(layout !== "stacked" && "text-sm", layout === "row" && width === 96 && "min-w-0 flex-1", align === "end" && "text-right", dimmed && "text-gray-dim")}>{children}</dd>
  </div>;
}
