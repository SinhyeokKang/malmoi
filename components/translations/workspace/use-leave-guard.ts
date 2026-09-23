"use client";

import { useEffect, useRef } from "react";

/**
 * **뒤로/앞으로·새로고침 guard** (translation-rework T13 — design §10.5 실측).
 *
 * - 새로고침·탭 닫기: native `beforeunload`.
 * - 뒤로/앞으로: Next App Router는 window의 **bubble** `popstate` 리스너로 이동한다(`app-router.js`). 그래서 capture 리스너가
 *   먼저 돌고, `stopImmediatePropagation()` + `history.go(-delta)`로 URL을 되돌리면 Next가 이동하지 않는다. 확인하면 guard를 끄고
 *   `history.go(delta)`로 다시 간다. delta는 Navigation API의 `currentEntry.index` 차이다.
 * ⚠️ **Next 내부 동작에 기댄다** — Next가 Navigation API로 옮기면 조용히 무력화된다(`app-router.js`의 TODO). T19 실브라우저 회귀가 이
 *   항목을 든다. Navigation API가 없는 브라우저는 delta를 모르므로 막지 않는다 — draft가 사라질 수 있는 유일한 갈래다.
 * ⚠️ Navigation API `navigate`의 `preventDefault`는 쓰지 않는다 — 사용자 활성화 없이 반복하면 `cancelable=false`가 되어 draft를 잃었다.
 */
type NavigationApi = { currentEntry?: { index: number } | null };

export function useLeaveGuard(active: boolean, onBlocked: (proceed: () => void) => void): void {
  const blocked = useRef(onBlocked);
  blocked.current = onBlocked;

  useEffect(() => {
    if (!active) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);

    const navigation = (window as unknown as { navigation?: NavigationApi }).navigation;
    const indexNow = () => navigation?.currentEntry?.index ?? null;
    let settled = indexNow();
    let restoring = false;
    let released = false;
    const pop = (event: PopStateEvent) => {
      if (released) return;
      const now = indexNow();
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return; }
      if (now === null || settled === null || now === settled) return;
      const delta = now - settled;
      event.stopImmediatePropagation();
      restoring = true;
      window.history.go(-delta);
      blocked.current(() => { released = true; window.history.go(delta); });
    };
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", pop, true);
      settled = null;
    };
  }, [active]);
}
