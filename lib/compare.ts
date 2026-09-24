/**
 * `<` 비교 = UTF-16 코드 유닛 순서(숫자는 크기). **결정적 정렬의 기준 비교다** (launch-readiness L7.4) — 어댑터·Publish diff·
 * 표면 계획이 이것을 지난다. 인자 없는 `.sort()`(문자열 기본 비교도 코드 유닛 순이다)와 `lib/keys/translation-list.ts`의
 * `byCodeUnit` 사본은 같은 순서를 내지만 이 함수를 지나지 않는다.
 *
 * ⚠️ **`localeCompare`를 쓰지 않는다** — Node ICU 빌드·로케일에 따라 답이 달라 export 결정성(ARCHITECTURE §1.1)이
 * 실행 환경에 묶인다. ⚠️ **잎이다 — import가 0이다.** 클라이언트 그래프(`lib/surfaces/plan.ts`)가 값으로 읽는다.
 */
export function compareCodeUnits<T extends string | number>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
