"use client";

import type { ComponentProps } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { cn } from "@/lib/utils";

/**
 * **드래그로 폭을 바꾸는 패널 구분선** (DESIGN §6.56). 원본은 bugshot-2 로그 뷰어의 메인 리사이저다.
 *
 * ⚠️ **핸들 엘리먼트 자신은 안 보인다.** 보이는 것은 `::after` 하나뿐이고, 핸들은 **옛 `gap-*`을
 * 대신하는 투명 스트립**이다 — flex `gap` 안에 핸들을 그냥 끼우면 간격이 `gap + 핸들 + gap`으로
 * 늘어나므로, 부모의 `gap`을 떼고 그 폭을 핸들이 든다. 그래서 폭은 호출부가 준다(`w-2`·`w-4`).
 *
 * ⚠️ **히트 영역은 CSS가 아니다.** 라이브러리가 document의 pointermove에서 핸들 rect에 마진을 얹어
 * 판정한다(기본 `fine: 5px` / `coarse: 15px`). 그래서 시각 4px이어도 잡히고, `hitAreaMargins`를
 * 덮지 않는다.
 *
 * ⚠️ **커서를 여기서 걸지 않는다.** 드래그가 시작되면 라이브러리가 `document.head`에 `<style>`을
 * 꽂아 `*{cursor: ew-resize !important}`를 건다 — 그래서 포인터가 핸들을 벗어나도 커서가 유지된다.
 * 핸들에 `cursor-*`를 쓰면 먹지도 않으면서 "여기가 커서의 출처"라는 거짓 단서만 남는다.
 *
 * ⚠️ **가로 그룹만 있다.** 원본에는 세로 변형(`data-[panel-group-direction=vertical]:…`)이 있지만
 * 이 리포의 소비자 둘이 전부 가로라, 쓰지 않는 변형을 미리 들이지 않는다.
 */
export function ResizablePanelGroup({ className, ...props }: ComponentProps<typeof PanelGroup>) {
  return <PanelGroup className={cn("flex h-full w-full", className)} {...props} />;
}

export const ResizablePanel = Panel;

/**
 * ⚠️ **shadcn 기본은 `bg-border`라 구분선이 상시로 보인다.** 이 화면들의 패널 경계는 이미 흰 패널의
 * border가 만드므로, 선을 하나 더 그으면 경계가 두 겹이 된다. 그래서 핸들은 `bg-transparent`이고
 * 바는 **hover·drag에만** 뜬다 — 표시 트리거가 라이브러리가 DOM에 쓰는 `data-resize-handle-state`라
 * 이 컴포넌트에 state가 없다.
 *
 * ⚠️ **색이 `via-ring`이다 — 원본의 `via-blue-300`이 아니다.** blue-300은 리포에 0건인 미등재 raw
 * 색이고, `app/globals.css`가 그것을 **흰 배경 1.80:1이라 목측 뒤 버린** 색으로 기록하고 있다.
 * `--ring`(blue-400)은 이미 등재된 토큰이라 DESIGN §6.2에 색이 늘지 않는다.
 */
export function ResizableHandle({ className, ...props }: ComponentProps<typeof PanelResizeHandle>) {
  return (
    <PanelResizeHandle
      className={cn(
        "relative shrink-0 bg-transparent",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        // 4px 바를 투명 스트립 한가운데에 — 스트립 폭이 호출부마다 달라 `left-1/2`가 짝이다.
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
        "after:bg-gradient-to-b after:from-transparent after:via-ring after:to-transparent",
        "after:opacity-0 data-[resize-handle-state=hover]:after:opacity-100 data-[resize-handle-state=drag]:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}
