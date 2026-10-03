import type { ReactNode } from "react";

/**
 * 키 칩 — 회색 면(테두리 없음) + `text-foreground/60`, 높이 20 고정(search-ux-unify D14·C13).
 * 면은 `soft-neutral` 배지·`IconTile` muted와 같은 `--foreground` 알파다. 20이라 28 타일 행을 키우지 않는다.
 * ⚠️ `aria-hidden`이 기본이다 — 단축키의 의미는 소유자의 `aria-keyshortcuts`가 지고, Esc 칩은 표준 동작의 장식이다.
 * 글자는 `m.common.keys`에서 온다(소비처의 문자열 리터럴은 `hand-copies.test.ts`가 센다).
 * preflight가 kbd를 mono로 그리므로 sans를 명시한다.
 */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd aria-hidden className="bg-foreground/5 text-foreground/60 inline-flex h-5 shrink-0 items-center rounded px-1.5 font-sans text-xs leading-none font-medium">{children}</kbd>;
}
