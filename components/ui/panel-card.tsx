import type { ReactNode } from "react";

/**
 * Profile 카드의 **사실 블록** — 라벨 열 96 · `14px 16px`. Project Home 오른쪽 `Project` 카드의
 * 메타 열과 같은 형이다.
 *
 * ⚠️ **`<ul>`이 아니다.** 아바타·이름·이메일은 항목이 아니라 한 덩이의 사실이고, `<li>`로 만들면
 * 스크린리더가 "목록, 항목 3개"로 예고한 뒤 **편집 가능한 폼**을 읽는다.
 *
 * ⚠️ **행마다 `items-center`가 아니라 첫 줄 정렬이 필요한 칸이 있다** — 아바타 행은 두 열을
 * 가로지르므로 호출부가 `full`로 표시한다.
 */
export function PanelFacts({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 @min-form:grid-cols-[96px_1fr] items-center gap-x-3 gap-y-[6px] @min-form:gap-y-[14px] px-4 py-3.5">{children}</div>;
}
