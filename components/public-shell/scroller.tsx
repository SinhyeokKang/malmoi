"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 공개 셸 패널 안의 **유일한 세로 스크롤러**이자 셸의 유일한 클라이언트 잎.
 *
 * ⚠️ **마운트 때 포커스를 가져가고(해시가 있으면 그 헤딩), body로 빠지면 되찾는다** — 셸은 문서가 스크롤되지 않으므로 body에 포커스가
 * 있으면 Space/PageDown이 **아무것도 안 움직인다**(브라우저는 root scroller만 민다). `preventScroll`이 없으면
 * 포커스가 스크롤 위치를 건드린다.
 *
 * ⚠️ **포커스 링을 그리지 않는다**(`focus:outline-none`) — 조작 대상이 아니라 스크롤을 받는 그릇이다.
 * 선례는 `components/ui/modal.tsx`의 `tabIndex={-1}` 스크롤 바디 하나다.
 *
 * ⚠️ **`@/lib/**`를 import하지 않는다** — 읽는 순간 `client-graph.test.ts`의 번들 그래프가 늘어난다.
 * 그래서 `cn` 없이 클래스를 리터럴로 쓴다.
 *
 * `data-public-scroller`는 랜딩 스테이지(`components/landing/stage.tsx`)와 공개 문서 목차(`components/public-doc-toc.tsx` — `/privacy`·`/docs`)가
 * 스크롤 대상을 찾는 표식이다.
 *
 * 스크롤바 색은 `--foreground`의 알파다 — 시안의 `rgba(10,10,10,.2)`를 raw 색으로 들이지 않는다.
 */
/** 해시의 대상 요소. ⚠️ 깨진 퍼센트 인코딩(`#%E0`)은 `decodeURIComponent`가 던진다 — 대상 없음으로 읽는다. */
function hashTarget(hash: string): HTMLElement | null {
  if (hash.length <= 1) return null;
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}

export function PublicScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;
    // ⚠️ **해시 착지는 대상 헤딩이 포커스를 받는다**(DESIGN §6.61) — 스크롤러가 가져가면 Tab이 문서 첫머리에서
    // 다시 시작한다. 대상이 `tabIndex`를 든 것(원고 h2·방침 h2)일 때만이다 — 못 받는 요소에 주면 포커스가 body로 샌다.
    // 자식 effect가 먼저 돌아 여기가 마지막 판정이므로 다른 잎이 따로 옮기면 여기서 덮인다.
    const target = hashTarget(window.location.hash);
    (target && scroller.contains(target) && target.hasAttribute("tabindex") ? target : scroller).focus({ preventScroll: true });

    // ⚠️ **빠진 포커스를 되찾는다** — 헤더·푸터의 빈 곳을 누르면 포커스가 body로 가고, 그 뒤로 키보드 스크롤이 죽는다.
    // 옮겨 간 곳(`relatedTarget`)이 있으면 사용자가 고른 것이라 건드리지 않는다. 판정은 이동이 끝난 뒤에 한다.
    let timer = 0;
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget !== null) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.activeElement === document.body) scroller.focus({ preventScroll: true });
      }, 0);
    };
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusout", onFocusOut);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-public-scroller=""
      className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:color-mix(in_srgb,var(--foreground)_20%,transparent)_transparent] focus:outline-none"
    >
      {children}
    </div>
  );
}
