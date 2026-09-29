/** 링크 클릭 하나에서 판정에 필요한 사실만 — DOM 없이 테스트하려고 풀어 둔다. */
export type LinkClick = {
  button: number;
  /** meta·ctrl·shift·alt 중 하나라도 — 새 탭·새 창·다운로드로 간다. */
  modifier: boolean;
  target: string;
  download: boolean;
  /** 해석된 절대 주소(`HTMLAnchorElement.href`). */
  href: string;
  /** `location.href`. */
  current: string;
};

/**
 * 이 클릭이 **다른 화면으로 가는 같은 탭 이동**인가.
 *
 * ⚠️ **pathname이 같으면 켜지 않는다** — 쿼리만 바뀌는 이동(키 선택·필터·검색·로그 상세)은 화면 안의 상태 변화이고 각자
 * pending 형(`useTransition`·`useOptimistic`·chevron 스피너)을 든다. 전면 dim이 겹치면 먼저 선 선택까지 흐려진다.
 * 그래서 꺼짐 신호도 pathname 하나로 충분하다(`components/shell/navigation-dim.tsx`).
 */
export function dimsNavigation(click: LinkClick): boolean {
  if (click.button !== 0 || click.modifier || click.download) return false;
  if (click.target !== "" && click.target !== "_self") return false;
  let to: URL;
  let from: URL;
  try {
    to = new URL(click.href);
    from = new URL(click.current);
  } catch {
    return false;
  }
  return to.origin === from.origin && to.pathname !== from.pathname;
}
