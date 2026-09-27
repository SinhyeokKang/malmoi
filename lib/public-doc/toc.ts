/**
 * `/privacy` 목차의 현재 절 판정 — 시안 `Landing Prototype.dc.html` `isPrivacy` 식(`offsetTop − offset <= scrollTop`).
 *
 * ⚠️ **잎이다** — TOC 클라이언트 컴포넌트가 스크롤마다 값으로 읽으므로 아무것도 import하지 않는다
 * (`components/__tests__/client-graph.test.ts`가 센다).
 *
 * 윗변이 `scrollTop + offset`을 넘지 않은 **마지막** 절이고, 없으면 첫 절이다. 레이아웃 전 NaN은 건너뛴다 —
 * 강조가 사라지면 "지금 어디인가"가 비는 순간이 생긴다.
 *
 * ⚠️ **끝(`maxScroll` = `scrollHeight − clientHeight`)에 닿으면 마지막 절이다** — 마지막 절이 짧으면 그 윗변이
 * 기준선에 영영 못 닿아, 1440×900에서 끝까지 내려도 `Changes to this policy`가 강조되지 않았다. 1px 여유는
 * 소수 scrollTop(배율 줌) 때문이다. 스크롤할 것이 없으면(`maxScroll <= 0`) 이 규칙을 걸지 않는다.
 */
export function currentSection(offsets: readonly number[], scrollTop: number, offset: number, maxScroll: number): number {
  if (Number.isNaN(scrollTop)) return 0;
  if (offsets.length > 0 && maxScroll > 0 && scrollTop >= maxScroll - 1) return offsets.length - 1;
  let current = 0;
  offsets.forEach((top, index) => {
    if (top - offset <= scrollTop) current = index;
  });
  return current;
}
