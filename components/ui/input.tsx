import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * 입력 셋(Input·Textarea·Select)의 공통 형 — DESIGN §6.4의 한 행이다.
 *
 * ⚠️ **포커스 링은 여기 없다.** 셋은 각자의 **여는 태그에 리터럴로** 적는다 — `focus-ring.test.ts`가
 * 태그의 소스를 읽으므로 상수에 넣는 순간 그 방어선이 이 파일들을 못 본다 (§7).
 */
export const fieldClass = cn(
  "border-input bg-background rounded-md border px-2 text-sm",
  "disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed",
  "aria-[invalid=true]:border-destructive",
);

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, "h-8", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none", className)} {...props} />;
}
