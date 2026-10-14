import { compareCodeUnits } from "@/lib/compare";
import type { LocaleOperation } from "@/lib/locales/effects";
import type { LocaleWorkItem } from "@/lib/locales/work";

/**
 * **자동 적재의 언어 변경 게이트** (locale-add design §1 "보류"). CI `/api/push`·야간 적재가 사전 판정과 잠금 안 재판정에서 같이 부른다.
 *
 * 입력은 소스별 언어 작업(`localeWork` — 현재 효과 ≠ 전달 효과)뿐이고 **리포 값을 보지 않는다.** 전달 목록과 다른 REMOVE가 하나라도 있으면
 * 적재 **전체**를 보류한다 — 셀을 고르지 않으므로 `pending-edits` 보류와 같은 부류이고 병합이 아니다(ARCHITECTURE §0 불변식 2). 전달된 뒤의
 * 보호는 열린 PR 게이트가 맡는다. 미전달 편집 보류와 같이 **프로젝트 단위**다.
 *
 * ⚠️ 전달 뒤 취소한 REMOVE(`current: null`·`delivered: "delete"`)는 보류가 아니다 — 의도가 사라졌고, 그 뒤의 존재는 리포가 정한다.
 * ⚠️ 잎 모듈이다 — 타입만 문다(`./apply`의 I/O·`server-only`를 끌어오지 않는다).
 */

export type LocaleImportGate = { action: "apply" } | { action: "defer"; reason: "locale-change-pending" };

export function planLocaleImportGate(states: readonly { work: readonly LocaleWorkItem[] }[]): LocaleImportGate {
  const undelivered = states.some(state => state.work.some(item => item.current === "delete" && item.delivered !== "delete"));
  return undelivered ? { action: "defer", reason: "locale-change-pending" } : { action: "apply" };
}

/**
 * strict 적재가 orphan 대상에서 뺄 언어 — 아직 만료되지 않은 ADD 행. 값 0개 ADD는 파일이 없어 관측되지 않으므로, 빼지 않으면 방금 추가한
 * 언어를 첫 적재가 지운다(R-A1 🔴 R1). ⚠️ 배열이다 — 코드를 객체 키로 쓰지 않는다(`__proto__`).
 */
export function keptAddLocales(rows: readonly { localeCode: string; operation: LocaleOperation }[]): string[] {
  return [...new Set(rows.filter(row => row.operation === "ADD").map(row => row.localeCode))].sort(compareCodeUnits);
}
