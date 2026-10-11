"use client";

import { useEffect, useRef, type FocusEvent, type RefObject } from "react";

import { WIDE_QUERY } from "@/lib/shell/breakpoint";

/**
 * **좁아지며 숨는 묶음의 포커스 이관** — 소비자 셋: 공개 헤더 `WideOnly`(→ 메뉴 버튼, `components/public-shell/nav-drawer.tsx`) · `/docs` 고정 내비
 * (→ 캡슐, `components/docs/nav-sheet.tsx`) · 앱 고정 LNB(→ 앱 메뉴 버튼, `components/shell/shell-panels.tsx`). 셋째 소비자가 붙으며(responsive-app A2) 공개 셸에서 이리 옮겼다.
 * 리스너는 **포커스가 묶음 안에 들어온 뒤 실제로 떠나기 전까지만** 단다(포커스·포인터로 서고, 다른 요소로 옮겨 가는 blur에서 떨어진다).
 *
 * ⚠️ **세 순서를 다 받는다**(#214):
 * - **Chrome — 사건이 없다**(재실측 2026-10-10): 숨은 노드의 포커스를 focus fixup이 `blur` 없이 `body`로 옮기고, MQL `change`가 올 때는 이미 `body`다.
 *   리스너가 살아 있다는 것 자체가 "안에 있었다"의 기억이다 — `change` 때 `activeElement`가 `body`(또는 아직 안)면 넘긴다.
 * - **blur 먼저**: 스타일 재계산이 `change`보다 먼저 와 relatedTarget 없는 `blur`가 오면, 묶음이 이미 `display: none`일 때 그 자리에서 넘긴다.
 *   숨지 않았는데 relatedTarget이 없으면(빈 곳 클릭) 셸 스크롤러의 몫이라 리스너를 뗀다.
 * - **`change` 먼저**: 포커스가 아직 안이면 넘긴다.
 * ⚠️ **안의 트리거가 연 포털 메뉴(푸터 스위처)도 묶음 안이다** — 메뉴가 열린 채 좁아지면 숨은 트리거에 붙어 남는다. 메뉴는 `change` 때 DOM에서 찾고
 * (`aria-labelledby`가 묶음 안의 트리거), Esc로 닫은 뒤 Radix가 (숨은) 트리거로 돌려주는 복귀가 지난 다음에 넘긴다. 포인터로 연 메뉴는 트리거에
 * 포커스가 서지 않으므로 `pointerdown`도 리스너를 세운다.
 */
export function useNarrowHandoff(ref: RefObject<HTMLElement | null>, target: string) {
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const focusTarget = () => document.querySelector<HTMLElement>(target)?.focus();

  function handOff() {
    stop.current?.();
    focusTarget();
  }

  function watch() {
    if (stop.current !== null) return;
    // ⚠️ jsdom에는 `matchMedia`가 없다 — 없는 환경은 폭이 바뀌지 않는 것으로 읽는다.
    const query = window.matchMedia?.(WIDE_QUERY);
    if (query == null) return;
    const onChange = (event: { matches: boolean }) => {
      const wrapper = ref.current;
      if (event.matches || wrapper === null) return;
      const menu = openMenuFrom(wrapper);
      if (menu !== null) {
        stop.current?.();
        menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        // Radix는 메뉴가 떨어진 뒤 `setTimeout(0)`에 트리거로 돌려준다 — 떨어진 것을 본 다음 틱에 넘겨 그 복귀 뒤에 선다.
        let tries = 0;
        const after = () => {
          if (menu.isConnected && ++tries < 20) { window.setTimeout(after, 0); return; }
          window.setTimeout(focusTarget, 0);
        };
        window.setTimeout(after, 0);
        return;
      }
      const active = document.activeElement;
      if (active === null || active === document.body || wrapper.contains(active)) handOff();
    };
    query.addEventListener("change", onChange);
    stop.current = () => { query.removeEventListener("change", onChange); stop.current = null; };
  }

  function onBlur(event: FocusEvent) {
    const wrapper = ref.current;
    if (wrapper === null) return;
    const next = event.relatedTarget;
    if (next instanceof Node && (wrapper.contains(next) || menuFrom(next, wrapper) !== null)) return;
    if (next === null && getComputedStyle(wrapper).display === "none") { handOff(); return; }
    stop.current?.();
  }

  return { onFocus: watch, onPointerDown: watch, onBlur };
}

/** 노드가 든 메뉴가 묶음 안의 트리거가 연 것이면 그 메뉴. */
function menuFrom(node: Node, wrapper: HTMLElement): HTMLElement | null {
  const menu = node instanceof Element ? node.closest<HTMLElement>('[role="menu"]') : null;
  const opener = menu?.getAttribute("aria-labelledby");
  return menu != null && opener != null && wrapper.contains(document.getElementById(opener)) ? menu : null;
}

/** 묶음 안의 트리거가 연, 지금 열린 메뉴. */
function openMenuFrom(wrapper: HTMLElement): HTMLElement | null {
  for (const menu of document.querySelectorAll<HTMLElement>('[role="menu"]')) if (menuFrom(menu, wrapper) !== null) return menu;
  return null;
}
