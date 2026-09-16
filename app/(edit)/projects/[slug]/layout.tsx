import type { ReactNode } from "react";

import { ContentPanel } from "@/components/shell/content-panel";

/**
 * 프로젝트 축의 레이아웃 (8-2 신설).
 *
 * ⚠️ **이 파일이 생긴 이유는 셸이 `[slug]`를 못 보기 때문이다.** `app/(edit)/layout.tsx`는
 * `/projects` 목록도 감싸므로 params가 없다 — 프로젝트에 속하는 셸 조각이 설 자리가 여기다.
 *
 * ⚠️ **지금 드는 것은 콘텐츠 패널 하나뿐이다.** 2026-09-16에 오른쪽 프로젝트 패널을 지웠고
 * (`shell-layout.test.ts`가 그 부재를 센다), 그래서 이 레이아웃이 **`ContentPanel` 한 겹**만 남았다.
 * 지우지 않는 이유는 `[slug]` 아래 페이지들이 각자 패널을 들게 되어 **"라우트마다 정확히 하나"**를
 * 여러 자리에서 다시 지켜야 하기 때문이다 — 그 규칙의 소유자를 하나로 둔다.
 *
 * ⚠️ **서버 데이터를 읽지 않는다.** 레이아웃은 인가의 차단 지점이 될 수 없으므로(App Router가
 * 페이지와 병렬로 렌더한다) 여기서 조회를 시작하면 **인가를 지나기 전에** 프로젝트 데이터를 만진다.
 */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  return <ContentPanel>{children}</ContentPanel>;
}
