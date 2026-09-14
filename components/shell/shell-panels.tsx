"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { m } from "@/lib/i18n";
import { panelConstraints, type PanelPx } from "@/lib/shell/panel-size";

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

  return (
    <div ref={measure} className="flex min-h-0 flex-1">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel
          {...(constraints ?? FALLBACK)}
          /**
           * ⚠️ **재기 전에는 %가 거짓이라 px로 못박는다.** 그룹 폭이 뷰포트를 따르는데 SSR은 그것을
           * 모른다 — 1264 기준 %를 그대로 그리면 2560 디스플레이에서 LNB가 486px인 채로 **하이드레이션이
           * 끝날 때까지** 서 있는다(한 프레임이 아니다). `styleFromProps`가 라이브러리 스타일 뒤에
           * 펼쳐지므로 이 override가 이긴다. 재고 나면 떼고 %에 맡긴다.
           */
          style={
            constraints === null
              ? { flexGrow: 0, flexShrink: 0, flexBasis: `${SHELL_SIDEBAR_PX.default}px` }
              : undefined
          }
        >
          {sidebar}
        </ResizablePanel>
        <ResizableHandle aria-label={m.common.resizeSidebar} className="w-2" />
        {/* `ContentPanel` + `ProjectPanel`이 이 안에서 gap 8로 나란하다 (`[slug]` 레이아웃이 둘을 낸다). */}
        <ResizablePanel className="flex min-w-0 gap-2">{children}</ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
