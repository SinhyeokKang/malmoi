import { useEffect, useRef } from "react";

/**
 * 포커스 착지 (audit #32·#35 — DESIGN §7).
 *
 * 누른 컨트롤이 꺼지거나(`loading`) 사라지면(행 교체·Alert 닫기) 브라우저가 포커스를 `body`로 떨어뜨린다 — 다음
 * Tab이 페이지 맨 위에서 시작하고 스크린리더는 읽던 자리를 잃는다. 여기 셋이 그 뒤의 착지를 든다.
 *
 * ⚠️ **"빠졌을 때만" 옮긴다** — 사용자가 그 사이 다른 곳으로 옮긴 포커스를 뺏지 않는다. ⚠️ **꺼진 노드 위의 포커스도
 * 빠진 것으로 센다** — 브라우저의 focus fixup이 그것을 `body`로 돌리는 것은 비동기이고, jsdom에는 그 규칙이 없다.
 */
export function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected || active.matches(":disabled");
}

function usable(node: HTMLElement | null | undefined): node is HTMLElement {
  return node !== null && node !== undefined && node.isConnected && !node.matches(":disabled");
}

/** 포커스가 빠져 있으면 후보 중 붙어 있고 켜진 첫 요소로 옮긴다. 옮긴 요소를 돌려준다. */
export function landFocus(...candidates: (HTMLElement | null | undefined)[]): HTMLElement | null {
  if (!focusLost()) return null;
  const target = candidates.find(usable);
  if (target === undefined) return null;
  target.focus();
  return target;
}

/**
 * Tab 순서에 드는 요소. `aria-disabled`는 **든다** — 이 리포에서 꺼진 컨트롤은 포커스를 받고 사유를 읽힌다(§6.65).
 * ⚠️ `aria-hidden`·`inert` 아래는 뺀다 — 모달이 열려 있으면 Radix가 바깥을 그렇게 가린다.
 */
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 사라질 노드의 **다음** 포커스 가능 요소, 없으면 앞의 마지막 요소. 브라우저의 순차 탐색 시작점이 거기라
 * 키보드 사용자에게 가장 덜 놀라운 착지다.
 */
export function neighbourFocus(node: Element): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter(el => !node.contains(el) && el.getAttribute("tabindex") !== "-1" && el.closest('[aria-hidden="true"], [inert]') === null);
  const after = all.find(el => (node.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
  return after ?? all.filter(el => (node.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0).at(-1) ?? null;
}

/**
 * `pending`이 참→거짓으로 바뀐 **커밋 뒤에** 착지한다.
 *
 * ⚠️ **응답 콜백에서 바로 부르지 않는 이유**: 그 시점엔 `loading`이 아직 커밋 전이라 버튼이 여전히 `disabled`고
 * `focus()`가 조용히 무시된다(malmoi#53·#64). `useTransition`의 `isPending`은 커밋 시점을 고를 수 없으므로 effect가
 * 그 값을 직접 본다. `candidates`는 그 커밋의 DOM을 읽는 함수다 — 서버 revalidate가 같은 커밋에 행을 바꾼다.
 */
export function useLandAfter(pending: boolean, candidates: () => (HTMLElement | null | undefined)[] | HTMLElement | null | undefined): void {
  const was = useRef(pending);
  useEffect(() => {
    const ended = was.current && !pending;
    was.current = pending;
    if (!ended) return;
    const picked = candidates();
    landFocus(...(Array.isArray(picked) ? picked : [picked]));
  });
}
