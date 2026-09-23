/**
 * 선택 키 우선순위 (translation-rework — spec §3.2 · R3).
 *
 * ⚠️ **"범위 밖이면 비운다"를 모든 갱신에 적용하지 않는다** — 저장 응답·재검증은 선택을 그대로 두고,
 * 같은 필터 세대의 Saved 보존 행은 조건 밖이어도 다시 열린다. 자동 선택은 트리 전환 하나뿐이다.
 */
export type SelectionEvent =
  | { reason: "tree"; current: string | undefined; firstKeyId: string | undefined }
  | { reason: "filter" | "search" | "clear"; current: string | undefined; currentInResult: boolean; firstKeyId?: string }
  | { reason: "revalidate"; current: string | undefined; currentInResult?: boolean }
  | { reason: "row"; current: string | undefined; target: string; targetSelectable: boolean }
  | { reason: "landing"; current: string | undefined; firstKeyId?: string };

export function planTranslationSelection(event: SelectionEvent): { key: string | undefined } {
  switch (event.reason) {
    case "tree": return { key: event.firstKeyId };
    case "filter":
    case "search":
    case "clear": return { key: event.currentInResult ? event.current : undefined };
    case "revalidate": return { key: event.current };
    case "row": return { key: event.targetSelectable ? event.target : event.current };
    // 오래된 링크를 다른 키로 바꾸지 않는다 — 부재는 상세가 말한다.
    case "landing": return { key: event.current };
  }
}
