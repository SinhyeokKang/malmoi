"use client";

import type { InputHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/utils";

/**
 * `Input`의 네이티브 `<input>` — **핸들러를 가진 유일한 조각이라 클라이언트 모듈에 산다** (2026-10-12).
 *
 * ⚠️ `input.tsx`는 `"use client"`가 아니다 — `/account`·라우트 골격 같은 서버 컴포넌트가 그것을 그리고, 서버 쪽 소비자가
 * `fieldClass` 상수를 값으로 읽는다(클라이언트 모듈의 상수는 서버에서 참조 객체가 된다). 그래서 핸들러만 여기로 떼었다 —
 * 인라인 핸들러가 `input.tsx`에 있으면 서버 렌더가 `Event handlers cannot be passed to Client Component props`로
 * 떨어진다(`server-render-graph.test.ts`가 센다).
 *
 * ⚠️ 읽기 전용 필드는 **클릭으로 받은 포커스에 링을 세우지 않는다** (2026-10-12 사용자). Chrome은 readOnly 입력을
 * 클릭해도 `:focus-visible`을 매치해(ego-browser 실측 — Chrome 152) CSS만으로는 클릭과 Tab을 못 가른다. 그래서
 * 포인터로 받은 포커스를 `data-pointer-focus`로 표시하고 링은 그 표시가 있을 때만 끈다 — Tab으로
 * 들어오면 표시가 없어 키보드 링은 그대로다. 표시는 blur에서 걷는다(다음 포커스가 키보드일 수 있다).
 *
 * ⚠️ **링 셋이 네이티브 태그와 같은 파일에 산다** — `focus-ring.test.ts`가 태그를 가진 파일과 링을 든 파일을 같이 센다(DESIGN §7).
 * 링이 맨 앞이라 `Input`이 조립한 클래스(소비자 `className` 포함)가 뒤에서 이긴다. `bare`는 `ring={false}`로 끈다.
 */
export function InputElement({ ring = true, className, onPointerDown, onBlur, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement>; ring?: boolean }) {
  return <input className={cn(
    ring && "focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none aria-[invalid=true]:focus-visible:border-destructive aria-[invalid=true]:focus-visible:ring-destructive read-only:data-[pointer-focus]:focus-visible:ring-0 read-only:data-[pointer-focus]:focus-visible:border-input",
    className,
  )} onPointerDown={(event) => {
    if (props.readOnly) event.currentTarget.setAttribute("data-pointer-focus", "");
    onPointerDown?.(event);
  }} onBlur={(event) => {
    event.currentTarget.removeAttribute("data-pointer-focus");
    onBlur?.(event);
  }} {...props} />;
}
