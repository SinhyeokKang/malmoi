import type { ComponentPropsWithRef } from "react";

import { cn } from "@/lib/utils";

import { fieldClass } from "./input";

/**
 * 번역 셀이 이것이다.
 *
 * ⚠️ **`ref`를 받는다** — 저장 실패 뒤 커서를 되돌리는 셀이 그 노드를 알아야 한다 (design §3.8).
 * React 19는 함수 컴포넌트에 `ref`를 그냥 prop으로 넘기므로 `forwardRef`가 필요 없지만, 타입은
 * `ComponentPropsWithRef`여야 그 prop이 존재한다.
 *
 * ⚠️ **`rows=1` + `field-sizing-content`** — 지원 브라우저에서 내용만큼 자라고, 미지원이면 1행으로
 * 고정된다(값을 잃지 않는다). 903행 표에서 고정 높이 textarea는 세로 스크롤을 세 배로 만든다.
 */
export function Textarea({ className, rows = 1, ...props }: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      rows={rows}
      /**
       * ⚠️ **`resize-none`이다** (2026-09-11 실물). `field-sizing-content`가 높이를 내용에 맞추므로
       * 손잡이가 할 일이 없는데, 브라우저 기본값이 그것을 오른쪽 아래에 그린다 — 번역 표에서는
       * **셀마다 그 빗금이 서서** 값 옆에 정체 모를 글리프가 2,709개 붙는다(시안에 없다).
       */
      className={cn(fieldClass, "field-sizing-content resize-none py-1", "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none", className)}
      {...props}
    />
  );
}
