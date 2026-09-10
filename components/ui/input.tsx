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

/**
 * ⚠️ **높이가 36이다** (2026-09-11 — `Button` `md`와 같은 커밋). 시안의 필드가 36이고, **버튼만
 * 올리면 번역 화면 툴바에서 32 필드와 36 버튼이 나란히 어긋난다** — 한 줄에 서는 컨트롤은 같은
 * 높이여야 한다. `Textarea`는 이 규칙 밖이다(`field-sizing-content`라 높이를 내용이 정한다).
 */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, "h-9", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none", className)} {...props} />;
}
