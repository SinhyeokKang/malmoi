/**
 * `/changelog`가 몇 개를 보이나 (changelog-pagination design §3). 서버가 받은 전 목록을 렌더하고 클라이언트는 숨김만 푼다.
 *
 * ⚠️ **import가 0인 잎이다** — `components/changelog/release-list.tsx`가 값으로 읽어 클라이언트 번들에 온다.
 * 파싱·로더(`./parse`·`./load`)를 물면 `client-graph.test.ts`의 잎 검사가 red다.
 *
 * 초기값은 `nextVisible(0, total)`이다. ⚠️ **초기값에 해시를 쓰지 않는다** — 서버는 해시를 모르므로 hydration이 어긋난다.
 */
export const REVEAL_STEP = 10;

/** 다음 묶음 — total을 넘지 않는다. */
export function nextVisible(visible: number, total: number): number {
  return Math.min(visible + REVEAL_STEP, total);
}

/** index번째(0부터)를 포함하는 묶음 끝 — 이미 보이거나 범위 밖이면 visible 그대로다(줄이지 않는다). */
export function visibleToInclude(index: number, visible: number, total: number): number {
  if (!(index >= visible && index < total)) return visible;
  return Math.min((Math.floor(index / REVEAL_STEP) + 1) * REVEAL_STEP, total);
}
