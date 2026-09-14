"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ImperativePanelGroupHandle } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { m } from "@/lib/i18n";
import { panelConstraints, panelLayout, type PanelPx } from "@/lib/shell/panel-size";

/**
 * LNB의 px 치수. **하한 200**은 nav 항목의 아이콘+라벨+배지가 유지되는 자리, **기본 240**은 시안
 * `212:944`(옛 `w-60`), **상한 320**은 우측 `ProjectPanel`과 **같은 값**이다 — 한 화면의 보조 패널
 * 둘이 서로 다른 임의 치수를 갖지 않는다 (DESIGN 규약 6).
 *
 * 가장 빡빡한 라우트(`[slug]` — `ProjectPanel` 320이 동시에 선다)에서 콘텐츠가 받는 폭은
 * `1264 − LNB − 8(핸들) − 8(gap) − 320`이라 608~688이다.
 */
export const SHELL_SIDEBAR_PX: PanelPx = { min: 200, default: 240, max: 320 };

/** 핸들 폭 = 떼어낸 `gap-2`의 폭. 이 값이 갈리면 변경 전후로 간격이 달라진다. */
export const SHELL_HANDLE_PX = 8;

/**
 * ⚠️ **재기 전에 쓰는 % 폴백.** 라이브러리는 `defaultSize` 없이 서버 렌더하면 **layout shift를
 * 경고**하고 패널을 균등 분할한다. 최소 대응 너비(1280 − `p-2` 16 − 핸들 8)를 기준으로 두면
 * 그 경고도, 균등 분할도 없다.
 */
const FALLBACK = panelConstraints(1280 - 16 - SHELL_HANDLE_PX, SHELL_SIDEBAR_PX) ?? undefined;

/**
 * 셸의 본문 행 — **LNB ↔ 콘텐츠를 드래그로 가른다.**
 *
 * ⚠️ **`app/(edit)/layout.tsx`는 서버 컴포넌트다.** `PanelGroup`은 클라이언트 전용이라 이 래퍼가
 * 경계를 든다. `sidebar`와 `children`은 **prop으로 통과**한다 — 서버 컴포넌트를 클라이언트
 * 컴포넌트의 자식으로 넘기는 것은 유효하고, 그래야 셸의 서버 데이터 조회가 이쪽으로 끌려오지 않는다.
 *
 * ⚠️ **행의 `gap-2`가 사라지고 핸들 폭이 그 자리를 든다** — flex `gap` 안에 핸들을 끼우면 간격이
 * `8 + 8 + 8`이 된다. 콘텐츠 쪽 패널 **안**의 `gap-2`는 그대로다: `ContentPanel`과 `ProjectPanel`은
 * 여전히 gap 8로 나란한 형제다.
 */
export function ShellPanels({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [available, setAvailable] = useState<number | null>(null);
  const [group, setGroup] = useState<HTMLElement | null>(null);

  /**
   * ⚠️ **콜백 ref다.** `PanelGroup`의 ref는 DOM 노드가 아니라 imperative 핸들이라 그룹 자신을 잴 수
   * 없고, 그래서 바깥 래퍼를 잰다.
   */
  const measure = useCallback((node: HTMLElement | null) => setGroup(node), []);

  useEffect(() => {
    if (group === null) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? group.getBoundingClientRect().width;
      setAvailable(width - SHELL_HANDLE_PX);
    });
    observer.observe(group);
    return () => observer.disconnect();
  }, [group]);

  const constraints = available === null ? null : panelConstraints(available, SHELL_SIDEBAR_PX);

  /**
   * ⚠️ **`defaultSize`를 다시 줘도 이미 놓인 패널은 안 움직인다** (2026-09-15 실물 검증 — 1440에서
   * LNB가 270, 1920에서 상한 320이었다). 그래서 잰 폭이 바뀔 때마다 **명령형으로** 되돌린다.
   * 지키는 것은 %가 아니라 px이고, 사용자가 창을 넓혔다고 LNB가 같이 넓어지지 않는다.
   */
  const groupRef = useRef<ImperativePanelGroupHandle>(null);
  /** 지금 지켜야 할 LNB의 px. 시안 값에서 시작하고 **사용자의 드래그만** 이 값을 바꾼다. */
  const sidebarPx = useRef(SHELL_SIDEBAR_PX.default);
  const dragging = useRef(false);

  useEffect(() => {
    if (available === null) return;
    const layout = panelLayout(available, sidebarPx.current);
    if (layout !== null) groupRef.current?.setLayout(layout);
  }, [available]);

  return (
    <div ref={measure} className="flex min-h-0 flex-1">
      {/*
        ⚠️ **그룹에도 인라인 `overflow: hidden`이 붙는다** — 패널만 풀면 `ProjectPanel`의 오른쪽
        그림자가 그룹 경계에서 잘린다. 셸 바깥의 `p-2`가 그 여백을 이미 들고 있다.
      */}
      <ResizablePanelGroup ref={groupRef} direction="horizontal" style={{ overflow: "visible" }}>
        <ResizablePanel
          {...(constraints ?? FALLBACK)}
          /**
           * ⚠️ **드래그일 때만 받는다.** 폭 변화로 우리가 부른 `setLayout`도 여기로 돌아오는데, 그것을
           * 새 의사로 읽으면 px가 그때그때의 반올림을 따라 흘러간다.
           */
          onResize={(size) => {
            if (dragging.current && available !== null) sidebarPx.current = (size / 100) * available;
          }}
          /**
           * ⚠️ **재기 전에는 %가 거짓이라 px로 못박는다.** 그룹 폭이 뷰포트를 따르는데 SSR은 그것을
           * 모른다 — 1264 기준 %를 그대로 그리면 2560 디스플레이에서 LNB가 486px인 채로 **하이드레이션이
           * 끝날 때까지** 서 있는다(한 프레임이 아니다). `styleFromProps`가 라이브러리 스타일 뒤에
           * 펼쳐지므로 이 override가 이긴다. 재고 나면 떼고 %에 맡긴다.
           */
          /**
           * ⚠️ **`overflow`를 되돌린다** — 라이브러리의 `getPanelStyle`이 인라인으로 `hidden`을 걸어
           * 안쪽 패널의 `shadow-low`(4px 12px 4px)가 패널 경계에서 잘린다(2026-09-14 사용자 관측).
           * 스크롤은 안쪽 `ContentPanel`이 자기 `overflow-hidden`으로 들고 있어 여기는 필요 없다.
           */
          style={
            constraints === null
              ? { overflow: "visible", flexGrow: 0, flexShrink: 0, flexBasis: `${SHELL_SIDEBAR_PX.default}px` }
              : { overflow: "visible" }
          }
        >
          {sidebar}
        </ResizablePanel>
        <ResizableHandle
          aria-label={m.common.resizeSidebar}
          className="w-2"
          onDragging={(isDragging) => { dragging.current = isDragging; }}
        />
        {/* `ContentPanel` + `ProjectPanel`이 이 안에서 gap 8로 나란하다 (`[slug]` 레이아웃이 둘을 낸다). */}
        <ResizablePanel style={{ overflow: "visible" }} className="flex min-w-0 gap-2">{children}</ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
