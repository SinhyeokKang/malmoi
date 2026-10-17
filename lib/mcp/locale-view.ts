import type { SurfaceLocaleState } from "@/lib/locales/work";

/**
 * **MCP 조회의 언어 변경 투영** (locale-add design §5 "MCP 조회"). `get_project`·`list_keys`가 같은 모양을 싣는다 — 한 도구만 다른 판정을 쓰면
 * 에이전트가 두 답을 받는다. 입력은 `readLocaleStates`의 소스 상태다.
 *
 * ⚠️ 전달 여부는 코어 미리보기(`lib/locales/change.ts`의 `hasDelivered`)와 같은 판정이다 — ADD는 `create`, REMOVE는 `delete`가 전달 목록에 있나.
 * 확인이 무효화 중(`delivered: null`)이면 모름(`null`)이다 — "보내지 않았다"로 말하면 에이전트가 이미 실린 PR을 모른 채 안내한다.
 * ⚠️ 코드를 객체 키로 쓰지 않는다 — 배열·Map이다(`__proto__`).
 */

export type LanguageChangeView =
  | { language: string; change: "add"; requestedAt: string; delivered: boolean | null; editable: true }
  /** 제거 예정 언어는 번역 저장·Revert가 거부된다(`locale-removal-pending`) — 편집할 수 없는 이유를 함께 싣는다. */
  | { language: string; change: "remove"; requestedAt: string; delivered: boolean | null; editable: false; reason: "removal-pending" };

export function languageChangesOf(state: Pick<SurfaceLocaleState, "rows" | "delivered">): LanguageChangeView[] {
  return state.rows.map((row): LanguageChangeView => {
    const effect = row.operation === "ADD" ? "create" : "delete";
    const delivered = state.delivered === null ? null : state.delivered.some(item => item.localeCode === row.localeCode && item.effect === effect);
    const base = { language: row.localeCode, requestedAt: row.requestedAt.toISOString(), delivered };
    return row.operation === "ADD"
      ? { ...base, change: "add", editable: true }
      : { ...base, change: "remove", editable: false, reason: "removal-pending" };
  });
}

/**
 * 보낼 언어 변경 수 — 현재 효과 ≠ 전달 목록인 언어 수(`work`)다. 행이 없어도(이미 보낸 제거를 취소) 다음 Publish가 되돌려야 하므로 센다.
 * 셀 편집 수(`toSend`)와 섞지 않는다(design §4 "집계·보호").
 */
export function languageChangeTotals(states: readonly Pick<SurfaceLocaleState, "surfaceId" | "work">[]): { total: number; bySurface: Map<string, number> } {
  const bySurface = new Map(states.map(state => [state.surfaceId, state.work.length]));
  return { total: [...bySurface.values()].reduce((sum, n) => sum + n, 0), bySurface };
}
