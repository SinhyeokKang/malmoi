import type { MouseEventHandler, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { TOUCH_TARGET } from "./button";

/**
 * 폭은 첫 소비자의 320으로 고정한다 — 플랫폼과 단축키 문구는 호출부가 소유한다.
 * 높이 44는 헤더 줄(`HeaderBar` `h-11`)을 채운다(search-ux-unify D13). hover는 흰 테두리 컨트롤의 정본(`button.tsx`)과 같다.
 */
/** 클래스를 한 곳에 둔다 — 랜딩 목업의 정적 `<span>`이 같은 값을 읽는다(손 사본 금지). */
export const FIELD_BUTTON_CLASS = "bg-background border-border-subtle shadow-low inline-flex h-11 w-80 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors hover:bg-primary-foreground focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none";

/**
 * **`lg` 미만 아이콘 형** (responsive-public PT1a) — 같은 인스턴스가 CSS로 32 아이콘이 된다. 두 벌을 그려 하나를 숨기면 인스턴스마다
 * 호출부의 document 리스너(검색 ⌘K)가 붙는다. 좁은 꼴은 헤더 Inbox 트리거와 같은 ghost `icon-md`(32 · radius 10 · 글리프 16 foreground ·
 * hover 3%)이고 터치에서는 `Button`과 같은 44 히트 영역이다. 접근 이름·`aria-keyshortcuts`는 그대로다(보이는 글자가 없어도 이름이 든다).
 * ⚠️ **토큰이 전부 `max-lg:`다** — `lg` 이상은 `FIELD_BUTTON_CLASS` 그대로이고, 목업은 이 형을 받지 않는다.
 */
const COMPACT = cn(
  "max-lg:size-8 max-lg:justify-center max-lg:rounded-md max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none max-lg:px-0",
  "max-lg:hover:bg-foreground/[0.03] max-lg:focus-visible:ring-2",
  TOUCH_TARGET,
);

export function FieldButton({ icon, placeholder, shortcut, compact = false, onClick, "aria-label": label, "aria-haspopup": hasPopup, "aria-expanded": expanded, "aria-keyshortcuts": keyShortcuts }: {
  icon: ReactNode;
  placeholder: ReactNode;
  shortcut?: ReactNode;
  /** `lg` 미만에서 32 아이콘이 된다 — 공개 셸 헤더만 준다(앱 셸은 1280 하한이라 뷰포트가 좁아도 캡슐이다). */
  compact?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  "aria-label": string;
  "aria-haspopup"?: "dialog";
  "aria-expanded"?: boolean;
  "aria-keyshortcuts"?: string;
}) {
  return <button
    type="button"
    aria-label={label}
    aria-haspopup={hasPopup}
    aria-expanded={expanded}
    aria-keyshortcuts={keyShortcuts}
    onClick={onClick}
    className={compact ? cn(FIELD_BUTTON_CLASS, COMPACT) : FIELD_BUTTON_CLASS}
  >
    <span aria-hidden className={cn("text-muted-foreground shrink-0 [&>svg]:size-4", compact && "max-lg:text-foreground")}>{icon}</span>
    <span className={cn("text-muted-foreground min-w-0 flex-1 truncate text-left", compact && "max-lg:hidden")}>{placeholder}</span>
    {/* 수화 전에도 자리는 남긴다 — 플랫폼 칩이 도착해도 placeholder 폭이 움직이지 않는다. */}
    <span aria-hidden className={cn("flex w-16 shrink-0 justify-end", compact && "max-lg:hidden")}>{shortcut}</span>
  </button>;
}
