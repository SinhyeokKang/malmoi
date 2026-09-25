"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 랜딩 패널 안의 **유일한 세로 스크롤러**이자 셸의 유일한 클라이언트 잎.
 *
 * ⚠️ **마운트 때 포커스를 가져간다** — 셸은 문서가 스크롤되지 않으므로 body에 포커스가 있으면
 * Space/PageDown이 **아무것도 안 움직인다**(브라우저는 root scroller만 민다). `preventScroll`이 없으면
 * 포커스가 스크롤 위치를 건드린다.
 *
 * ⚠️ **포커스 링을 그리지 않는다**(`focus:outline-none`) — 조작 대상이 아니라 스크롤을 받는 그릇이다.
 * 선례는 `components/ui/modal.tsx`의 `tabIndex={-1}` 스크롤 바디 하나다.
 *
 * ⚠️ **`@/lib/**`를 import하지 않는다** — 읽는 순간 `client-graph.test.ts`의 번들 그래프가 늘어난다.
 * 그래서 `cn` 없이 클래스를 리터럴로 쓴다.
 *
 * `data-landing-scroller`는 스테이지(`components/landing/stage.tsx`)가 자기 뷰포트를 찾는 표식이다.
 *
 * 스크롤바 색은 `--foreground`의 알파다 — 시안의 `rgba(10,10,10,.2)`를 raw 색으로 들이지 않는다.
 */
export function LandingScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-landing-scroller=""
      className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:color-mix(in_srgb,var(--foreground)_20%,transparent)_transparent] focus:outline-none"
    >
      {children}
    </div>
  );
}
