import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * ⚠️ **`text-mono`를 font-size 그룹으로 등록해야 한다** (docs/DESIGN.md §4.2).
 *
 * 등록하지 않으면 twMerge가 커스텀 `text-*`를 **text-color로 오분류**한다.
 * `cn("text-mono", "text-foreground")`에서 `text-mono`가 조용히 제거되고, base `text-xs`와도
 * dedupe되지 않는다 — bugshot-2가 액션 로그 값 칩에서 정확히 이 함정을 밟았다.
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": ["text-mono"] } },
});

/** shadcn 표준 헬퍼. 조건부 클래스는 항상 이걸 지난다 (DESIGN.md §8). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
