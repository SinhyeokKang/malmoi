import type { ReactNode } from "react";

import { ContentPanel } from "@/components/shell/content-panel";

/** 사용자 축에는 오른쪽 패널이 없다 — 콘텐츠 패널 하나뿐이다 (8-2). */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return <ContentPanel>{children}</ContentPanel>;
}
