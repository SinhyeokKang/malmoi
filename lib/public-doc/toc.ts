/**
 * `/privacy` 목차의 현재 절 판정 — 시안 `Landing Prototype.dc.html` `isPrivacy` 식(`offsetTop − offset <= scrollTop`).
 *
 * ⚠️ **잎이다** — TOC 클라이언트 컴포넌트가 스크롤마다 값으로 읽으므로 아무것도 import하지 않는다
 * (`components/__tests__/client-graph.test.ts`가 센다).
 *
 * 윗변이 `scrollTop + offset`을 넘지 않은 **마지막** 절이고, 없으면 첫 절이다. 레이아웃 전 NaN은 건너뛴다 —
 * 강조가 사라지면 "지금 어디인가"가 비는 순간이 생긴다.
 */
export function currentSection(offsets: readonly number[], scrollTop: number, offset: number): number {
  if (Number.isNaN(scrollTop)) return 0;
  let current = 0;
  offsets.forEach((top, index) => {
    if (top - offset <= scrollTop) current = index;
  });
  return current;
}
