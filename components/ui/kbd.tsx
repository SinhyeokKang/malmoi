import type { ReactNode } from "react";

// preflight가 kbd를 mono로 그리므로 기존 키 칩의 sans를 명시한다.
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="border-border text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 font-sans text-xs">{children}</kbd>;
}
