/**
 * **리포가 그 언어 요청대로인가** (#267 fix1) — 만료 뒤 존재(`planLocaleExpiry`의 `presence`)로 판정한다. 제거는 파일이 없고(orphan), 추가는 파일이 있다(active).
 * 아니면 요청이 리포에 닿지 못한 채 PR/MR이 닫혔다. ⚠️ 열린 PR 조회는 "열림/없음"만 알아 머지·미머지 종료를 가르지 못한다 — 이 관측이 가른다.
 * import 0인 잎이다 — 클라이언트 결과 갈래(`lib/publish/plan.ts`)가 부른다(`components/__tests__/client-graph.test.ts`).
 */
export function reachedRepository(request: { operation: "ADD" | "REMOVE"; presence: "active" | "orphan" }): boolean {
  return request.operation === "REMOVE" ? request.presence === "orphan" : request.presence === "active";
}
