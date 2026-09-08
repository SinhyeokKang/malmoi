import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

import { fieldClass } from "./input";

/**
 * **native select다** — Radix Select를 쓰지 않는다. 항목이 로케일·역할처럼 열 개 미만이고,
 * 모바일에서 OS 피커가 붙는 쪽이 낫다. 팝오버가 필요한 자리는 `DropdownMenu`다 (design §3.2).
 */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, "h-8", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none", className)} {...props} />;
}
