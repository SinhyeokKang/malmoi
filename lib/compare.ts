/**
 * `<` 비교 = UTF-16 코드 유닛 순서(숫자는 크기). **이 리포의 모든 결정적 정렬이 이것 하나를 지난다** (launch-readiness L7.4).
 *
 * ⚠️ **`localeCompare`를 쓰지 않는다** — Node ICU 빌드·로케일에 따라 답이 달라 export 결정성(ARCHITECTURE §1.1)이
 * 실행 환경에 묶인다. ⚠️ **잎이다 — import가 0이다.** 클라이언트 그래프(`lib/surfaces/plan.ts`)가 값으로 읽는다.
 */
export function compareCodeUnits<T extends string | number>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
