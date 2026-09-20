"use client";

import { useId, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";

/**
 * label + help + error를 한 형으로 든다 (DESIGN §6.4).
 *
 * ⚠️ **help·error의 `line-height`가 1.7이다** (2026-09-13 — 시안). 필드 아래 설명은 두세 줄이 되는
 * 자리라 기본 행간(1.33)이면 줄이 붙어 한 덩어리로 읽힌다. ⚠️ **`text-xs`에 `line-height`를 짝으로
 * 안 주는 것이 `@theme`의 결정**이므로 이 값은 소비자가 든다 (`app/globals.css`).
 *
 * ⚠️ **error가 있으면 help를 대신한다** — 둘을 같이 보이면 무엇을 고쳐야 하는지가 두 줄로 갈린다.
 * `htmlFor`/`id`는 호출부가 맞춘다 — 자동 생성하면 서버·클라이언트 id가 갈릴 수 있다.
 */
export function FormGroup({
  label,
  labelId,
  htmlFor,
  help,
  error,
  errorId,
  optional = false,
  children,
}: {
  label: ReactNode;
  /**
   * ⚠️ **Radix `Select`의 트리거가 이것을 필요로 한다.** 트리거는 `<button>`이고 접근 **값**이
   * 없어서, `<label for>`만 두면 스크린리더가 이름("Branch")만 말하고 고른 값을 말하지 않는다 —
   * `aria-labelledby="{labelId} {triggerId}"`로 이어야 이름 뒤에 값이 붙는다.
   */
  labelId?: string;
  htmlFor?: string;
  help?: ReactNode;
  error?: ReactNode;
  errorId?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const generatedId = useId();
  const id = errorId ?? (htmlFor ? `${htmlFor}-error` : `${generatedId}-error`);
  return (
    <div className="space-y-2">
      <label id={labelId} htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {optional && <span className="text-muted-foreground font-normal"> (optional)</span>}
      </label>
      {children}
      {error !== undefined ? (
        <p id={id} role="alert" className="text-destructive flex items-start gap-1.5 text-xs leading-[1.7]"><CircleAlert className="mt-1 size-3.5 shrink-0" aria-hidden />{error}</p>
      ) : help !== undefined ? (
        <p className="text-muted-foreground text-xs leading-[1.7]">{help}</p>
      ) : null}
    </div>
  );
}
