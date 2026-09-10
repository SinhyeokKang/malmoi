import type { ReactNode } from "react";

import { ContentPanel } from "@/components/shell/content-panel";
import { ProjectPanel } from "@/components/shell/project-panel";

/**
 * 프로젝트 축의 레이아웃 (8-2 신설).
 *
 * ⚠️ **이 파일이 생긴 이유는 셸이 `[slug]`를 못 보기 때문이다.** `app/(edit)/layout.tsx`는
 * `/projects` 목록도 감싸므로 params가 없고, 그래서 breadcrumb·Publish·오른쪽 패널이 셸에 없었다.
 * 프로젝트에 속하는 셸 조각이 설 자리가 여기다 — 8-3이 breadcrumb·Publish를, 8-P가 패널의 diff를
 * 이 레이아웃으로 가져온다.
 *
 * ⚠️ **지금은 서버 데이터를 읽지 않는다.** 패널이 골격뿐이라 읽을 것이 없고, 레이아웃은 인가의
 * 차단 지점이 될 수 없으므로(App Router가 페이지와 병렬로 렌더한다) 여기서 조회를 시작하면
 * **인가를 지나기 전에** 프로젝트 데이터를 만지게 된다. 8-P가 그것을 실을 때 판정도 함께 온다.
 */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ContentPanel>{children}</ContentPanel>
      <ProjectPanel />
    </>
  );
}
