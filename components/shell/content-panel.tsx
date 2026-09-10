import type { ReactNode } from "react";

/**
 * 콘텐츠가 앉는 흰 패널 — 시안의 `tab body` (8-2).
 *
 * ⚠️ **셸(`app/(edit)/layout.tsx`)이 `{children}`을 이걸로 감싸지 않는다.** 감싸면 오른쪽 패널이 그
 * 안에 갇혀 "패널 둘이 gap 8로 나란히"가 성립하지 않는다 — 대신 각 갈래의 레이아웃이 든다.
 * 라우트마다 **정확히 하나**인지는 `app/(edit)/__tests__/shell-layout.test.ts`가 체인을 훑어 센다.
 *
 * ⚠️ **네 클래스가 함께 있어야 패널이 뜬다** — 흰 배경 · radius · 아주 연한 border · `shadow-low`.
 * 8-1b가 그중 몇을 한꺼번에 잃고도 화면이 "그럭저럭" 보여서 못 알아챘다 (규약 3.5).
 *
 * ⚠️ **스크롤을 자기 안에서 든다** — 문서가 스크롤되면 셸이 딸려 올라간다 (malmoi#13).
 */
export function ContentPanel({ children }: { children: ReactNode }) {
  return (
    <div className="border-border-subtle bg-background shadow-low flex min-w-0 flex-1 flex-col overflow-y-auto rounded-xl border">
      {children}
    </div>
  );
}
