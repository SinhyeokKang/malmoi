import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 결과 목록의 묶음 — 전역 검색 `CommandGroup`과 헤더 Inbox의 프로젝트 묶음이 같이 쓴다(attention-inbox T8a).
 * 그룹은 세로 padding이 없고 두 번째부터 위쪽 선 하나다 — 선이 앞 그룹 마지막 행에 바로 붙어 활성 면이 선에서 뜨지 않는다.
 * 그룹 위 간격은 머리 `pt-4` 하나가 든다. 머리 `text-gray-dim`은 경계 표시라 행 보조 글자(#737373)와 층을 가른다(D15 — DESIGN §6.2 등재 이탈).
 * `icon`(16 썸네일)이 있을 때만 머리가 한 줄 정렬이 되고 이름이 잘린다 — 글자만인 검색 머리는 블록 그대로다.
 */
export function ListGroup({ heading, icon, children }: { heading: ReactNode; icon?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return <div role="group" aria-labelledby={headingId} className="not-first:border-divider not-first:border-t">
    <div id={headingId} className={cn("text-gray-dim px-4 pt-4 pb-1 text-xs font-medium", icon !== undefined && "flex items-center gap-2")}>
      {icon === undefined ? heading : <>{icon}<span className="min-w-0 truncate">{heading}</span></>}
    </div>
    {children}
  </div>;
}
