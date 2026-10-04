import type { MouseEventHandler, ReactNode } from "react";

/**
 * 폭은 첫 소비자의 320으로 고정한다 — 플랫폼과 단축키 문구는 호출부가 소유한다.
 * 높이 40은 헤더 줄(`HeaderBar` `h-10`)을 채운다(search-ux-unify D13). hover는 흰 테두리 컨트롤의 정본(`button.tsx`)과 같다.
 */
/** 클래스를 한 곳에 둔다 — 랜딩 목업의 정적 `<span>`이 같은 값을 읽는다(손 사본 금지). */
export const FIELD_BUTTON_CLASS = "bg-background border-border-subtle shadow-low inline-flex h-10 w-80 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors hover:bg-primary-foreground focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none";

export function FieldButton({ icon, placeholder, shortcut, onClick, "aria-label": label, "aria-haspopup": hasPopup, "aria-expanded": expanded, "aria-keyshortcuts": keyShortcuts }: {
  icon: ReactNode;
  placeholder: ReactNode;
  shortcut?: ReactNode;
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
    className={FIELD_BUTTON_CLASS}
  >
    <span aria-hidden className="text-muted-foreground shrink-0 [&>svg]:size-4">{icon}</span>
    <span className="text-muted-foreground min-w-0 flex-1 truncate text-left">{placeholder}</span>
    {/* 수화 전에도 자리는 남긴다 — 플랫폼 칩이 도착해도 placeholder 폭이 움직이지 않는다. */}
    <span aria-hidden className="flex w-16 shrink-0 justify-end">{shortcut}</span>
  </button>;
}
