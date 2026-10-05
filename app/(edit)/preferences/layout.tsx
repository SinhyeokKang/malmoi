import type { ReactNode } from "react";

import { ContentPanel } from "@/components/shell/content-panel";

/** 사용자 축 한 장짜리 라우트 — `/account`·`/mcp`와 같은 형이다(프로젝트 레이아웃이 없다). */
export default function PreferencesLayout({ children }: { children: ReactNode }) {
  return <ContentPanel>{children}</ContentPanel>;
}
