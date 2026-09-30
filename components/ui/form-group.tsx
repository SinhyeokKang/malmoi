"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

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
  optional?: boolean;
  children: ReactNode;
}) {
  /**
   * 오류·도움말 문구의 id — **소비자가 `aria-describedby`로 잇는다**(DESIGN §6.4). `htmlFor`가 있으면 그것에서
   * 파생해 호출부가 문자열을 그대로 적을 수 있고, 없을 때만 생성한다. ⚠️ 도움말에도 id가 있어야 한다 — 없으면 경로 형식
   * 같은 안내가 보이기만 하고 입력에 포커스한 스크린리더 사용자에게 안 닿는다 (audit #89).
   */
  const generatedId = useId();
  const base = htmlFor ?? generatedId;
  const id = `${base}-error`;
  return (
    <div className="space-y-2">
      <label id={labelId} htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {optional && <span className="text-muted-foreground font-normal"> (optional)</span>}
      </label>
      {children}
      {error !== undefined ? (
        <FieldError id={id}>{error}</FieldError>
      ) : help !== undefined ? (
        <p id={`${base}-help`} className="text-muted-foreground text-xs leading-[1.7]">{help}</p>
      ) : null}
    </div>
  );
}

/**
 * 필드 오류 한 줄 — `FormGroup` 밖에서 필드 옆 캡션·행 사유로 서는 오류도 이것이다 (ux-drift-unify 5-W1 · DESIGN §2.4 글리프 열 `CircleAlert`).
 * 전엔 기준 언어·초대 행·설정 캡션 둘이 행간·글리프·정렬을 각자 골라 같은 오류가 네 모양이었다.
 *
 * ⚠️ **`role="alert"`가 기본이고 호출부가 끌 수 있다** — 여러 줄이 한꺼번에 서고 요약을 따로 알리는 자리(초대 행 사유 —
 * 바닥 상태 문장이 알린다)는 `role={undefined}`로 끈다. `className`은 배치(폭·여백)만 덧댄다.
 */
export function FieldError({ className, children, ...props }: ComponentProps<"p">) {
  return (
    <p role="alert" data-field-error="" className={cn("text-destructive flex items-start gap-1.5 text-xs leading-[1.7]", className)} {...props}>
      <CircleAlert className="mt-1 size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
