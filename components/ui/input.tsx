import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { X } from "lucide-react";
import { Button } from "./button";
import { m } from "@/lib/i18n";

import { cn } from "@/lib/utils";

/** 실제 필드 폭만 지원한다. 반응형 min/max/flex 배치는 소비자 래퍼가 소유한다. */
export type FieldWidth = 132 | 160 | 168 | 192 | 220 | 240 | 256 | 320 | "full";
export const fieldWidthClass: Record<FieldWidth, string> = {
  132: "w-[132px]",
  160: "w-40",
  168: "w-[168px]",
  192: "w-48",
  220: "w-[220px]",
  240: "w-60",
  256: "w-64",
  320: "w-80",
  full: "w-full",
};

/**
 * 입력 셋(Input·Textarea·Select)의 공통 형 — DESIGN §6.4의 한 행이다.
 *
 * ⚠️ **좌우 padding이 10이다** (2026-09-13 — 핸드오프 실측). 8이면 모달의 검색 필드만 시안대로
 * 10이 되어 **같은 화면에서 필드 안쪽 여백이 둘로 갈린다.** 시안이 입력 전부를 10으로 그리므로
 * 프리미티브를 옮겼다 — 그래서 다른 화면의 필드도 2px 넓어진다.
 *
 * ⚠️ **포커스 링은 여기 없다.** 셋은 각자의 **여는 태그에 리터럴로** 적는다 — `focus-ring.test.ts`가
 * 태그의 소스를 읽으므로 상수에 넣는 순간 그 방어선이 이 파일들을 못 본다 (§7).
 */
export const fieldClass = cn(
  "border-input bg-background rounded-md border px-2.5 text-sm",
  "disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed",
  "aria-[invalid=true]:border-destructive",
);

/**
 * ⚠️ **높이가 36이다** (2026-09-11 — `Button` `md`와 같은 커밋). 시안의 필드가 36이고, **버튼만
 * 올리면 번역 화면 툴바에서 32 필드와 36 버튼이 나란히 어긋난다** — 한 줄에 서는 컨트롤은 같은
 * 높이여야 한다. `Textarea`는 이 규칙 밖이다(`field-sizing-content`라 높이를 내용이 정한다).
 */
/** `ref`는 React 19의 평범한 prop이라 `...props`로 그대로 내려간다 — `Button`과 같은 형이다. */
const INPUT_SIZE = { md: "h-9", sm: "h-8 text-xs", xs: "h-7 text-xs" } as const;

export function Input({ className, width, size = "md", variant = "default", icon, clearable, onClear, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "width" | "size"> & {
  ref?: Ref<HTMLInputElement>;
  width?: FieldWidth;
  size?: keyof typeof INPUT_SIZE;
  variant?: "default" | "bare";
  icon?: ReactNode;
  clearable?: boolean;
  /** 즉시 필터는 onChange만, 제출형 SearchInput은 확정 질의도 함께 지운다. */
  onClear?: () => void;
}) {
  const hasValue = props.value !== undefined && String(props.value).length > 0;
  const field = <input className={cn(
    fieldClass, INPUT_SIZE[size], width === undefined ? undefined : fieldWidthClass[width],
    "read-only:bg-muted read-only:text-foreground read-only:cursor-default",
    variant === "bare"
      ? "border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 focus-visible:outline-none"
      : "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
    icon && "pl-8", clearable && "pr-8", className,
  )} {...props} />;
  if (!icon && !clearable) return field;
  return <span className={cn("relative block min-w-0", width === "full" ? "w-full" : "w-fit")}>
    {icon && <span aria-hidden className={cn("text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 [&>svg]:size-4", size !== "md" && "[&>svg]:size-3.5")}>{icon}</span>}
    {field}
    {clearable && hasValue && !props.readOnly && <Button type="button" variant="ghost" size="icon-xs" disabled={props.disabled} aria-label={m.common.clearSearch}
      className="absolute top-1/2 right-1 -translate-y-1/2"
      onMouseDown={event => event.preventDefault()}
      onClick={event => {
        const input = event.currentTarget.parentElement?.querySelector("input");
        if (!input) return;
        // React의 값 추적을 우회하는 native setter여야 빈 값 onChange가 한 번 들어온다.
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        onClear?.();
        input.focus();
      }}><X aria-hidden className="size-3.5" /></Button>}
  </span>;
}
