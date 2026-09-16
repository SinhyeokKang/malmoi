import type { ReactNode } from "react";

import { ContentPanel } from "@/components/shell/content-panel";

/** 사용자 축에는 프로젝트 레이아웃이 없다(2026-09-16까지는 '오른쪽 패널이 없다'가 근거였고 그 패널을 지웠다 — DESIGN §6.55) — 콘텐츠 패널 하나뿐이다 (8-2). */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return <ContentPanel>{children}</ContentPanel>;
}
