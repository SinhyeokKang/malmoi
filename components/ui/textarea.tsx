import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

import { fieldClass } from "./input";

/**
 * 번역 셀이 이것이다.
 *
 * ⚠️ **`rows=1` + `field-sizing-content`** — 지원 브라우저에서 내용만큼 자라고, 미지원이면 1행으로
 * 고정된다(값을 잃지 않는다). 903행 표에서 고정 높이 textarea는 세로 스크롤을 세 배로 만든다.
 */
export function Textarea({ className, rows = 1, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cn(fieldClass, "field-sizing-content py-1", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none", className)}
      {...props}
    />
  );
}
