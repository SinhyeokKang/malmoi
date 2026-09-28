"use client";

import { createContext, useContext } from "react";

/**
 * LNB 접힘 상태 — **셸 패널(`shell-panels.tsx`)이 소유하고 사이드바가 읽는다.** 폭은 패널이 들고(`collapsible`), 사이드바는
 * 그 결과로 라벨·구역 머리를 숨길 뿐이다. 판정이 두 곳이면 드래그로 접었을 때 사이드바만 펼친 모양으로 남는다.
 *
 * 기본값은 펼침 + 아무것도 안 하는 토글이다 — 사이드바를 셸 밖에서 단독으로 그리는 테스트가 provider 없이 선다.
 */
export type SidebarCollapse = { collapsed: boolean; toggle: () => void };

export const SidebarCollapseContext = createContext<SidebarCollapse>({ collapsed: false, toggle: () => {} });

export function useSidebarCollapse(): SidebarCollapse {
  return useContext(SidebarCollapseContext);
}
