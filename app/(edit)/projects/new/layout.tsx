import type { ReactNode } from "react";

import { ContentPanel } from "@/components/shell/content-panel";

/**
 * 온보딩에는 오른쪽 패널이 없다 — 아직 프로젝트가 없다 (8-2).
 *
 * ⚠️ **페이지가 아니라 레이아웃이 감싼다** — 그 화면은 갈래마다 따로 반환하므로(계정 미연결·설치
 * 0·리포 0·본문) 페이지 안에서 감싸면 네 자리를 다 고쳐야 하고 하나를 빠뜨리면 그 갈래만 맨몸이다.
 */
export default function NewProjectLayout({ children }: { children: ReactNode }) {
  return <ContentPanel>{children}</ContentPanel>;
}
