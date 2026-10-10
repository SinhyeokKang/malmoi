// @vitest-environment jsdom
import { act, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SHELL_HANDLE_PX, SHELL_SIDEBAR_COLLAPSED_PX, ShellPanels } from "@/components/shell/shell-panels";
import { useSidebarCollapse } from "@/components/shell/sidebar-collapse";
import { WIDE_QUERY } from "@/lib/shell/breakpoint";
import { panelPercent } from "@/lib/shell/panel-size";

import { render } from "./helpers/dom";

/**
 * **좁은 모드의 셸 패널** (responsive-app design §2) — 두 Panel·핸들은 언제나 마운트되고, 좁은 동안은 `setLayout`·`onResize`를 건너뛰며,
 * 넓어지면 기억한 px(또는 접힘 40)를 그 폭에 다시 맞춘다. 접힘 쿠키·선호폭은 자동 전환으로 덮이지 않는다.
 *
 * ⚠️ **라이브러리를 대역으로 바꾼다** — jsdom에서는 `react-resizable-panels`가 패널을 등록하지 못해 `setLayout`이 던지고 `onResize`가 한 번도 안 돈다.
 * 이 파일이 재는 것은 셸이 **언제 무엇을 부르나**이고, 실제 드래그·배치는 브라우저 실측이 잰다.
 * ⚠️ **대역도 실제 라이브러리의 콜백 순서 셋을 낸다**(B1 리뷰 🟡4) — ① 마운트 때 `onResize(defaultSize)` ② 우리 `setLayout` 뒤 `onResize(layout[0])`
 * ③ 제약(`minSize`)이 바뀌어 지금 몫이 그 아래면 재검증 `onResize`(중간점 아래는 접힘, 위는 최소 — 좁은 폭의 자동 보정). 셋 다 사용자의 의사가 아니라서
 * 쿠키·선호폭을 바꾸면 안 된다 — 손으로 부르는 `onResize`만 재면 그 되돌아오는 길이 테스트 밖이다.
 */
type PanelProps = { children: ReactNode; className?: string; onResize?: (size: number) => void; defaultSize?: number; minSize?: number; collapsedSize?: number; collapsible?: boolean };
const lib = vi.hoisted(() => ({ setLayout: vi.fn(), onResize: null as ((size: number) => void) | null, size: 0 }));
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: forwardRef<{ setLayout: (layout: number[]) => void }, { children: ReactNode }>(function Group({ children }, ref) {
    useImperativeHandle(ref, () => ({ setLayout: lib.setLayout }));
    return <div data-group>{children}</div>;
  }),
  ResizablePanel: function Panel({ children, className, onResize, defaultSize, minSize, collapsedSize, collapsible }: PanelProps) {
    if (onResize) lib.onResize = onResize;
    const tracked = onResize !== undefined;
    useLayoutEffect(() => {
      if (!tracked) return;
      lib.size = defaultSize ?? 0;
      lib.onResize?.(lib.size);
      // 마운트 한 번 — 실제 라이브러리도 등록 때 한 번 낸다.
    }, []);
    const lastMin = useRef(minSize);
    useEffect(() => {
      if (!tracked || lastMin.current === minSize) return;
      lastMin.current = minSize;
      if (minSize === undefined || lib.size >= minSize) return;
      // 실제 규칙(`resizePanel` — 2.1.9): 접을 수 있으면 접힘·최소의 중간점 아래만 접고, 그 위는 최소로 올린다.
      const collapsed = collapsedSize ?? 0;
      lib.size = collapsible && lib.size < (collapsed + minSize) / 2 ? collapsed : minSize;
      lib.onResize?.(lib.size);
    }, [tracked, minSize, collapsedSize, collapsible]);
    return <div className={className}>{children}</div>;
  },
  ResizableHandle: ({ className }: { className?: string }) => <div role="separator" className={className} />,
}));

type Listener = (event: { matches: boolean }) => void;
const listeners = new Set<Listener>();
let wide = true;
const setWide = async (next: boolean) => {
  wide = next;
  await act(async () => { for (const listener of [...listeners]) listener({ matches: next }); });
};
let observe: ((width: number) => Promise<void>) | null = null;

beforeEach(() => {
  wide = true;
  listeners.clear();
  lib.setLayout.mockReset();
  // ② 우리 `setLayout`도 실제처럼 `onResize`로 되돌아온다.
  lib.setLayout.mockImplementation((layout: number[]) => { lib.size = layout[0] ?? 0; lib.onResize?.(lib.size); });
  lib.onResize = null;
  lib.size = 0;
  document.cookie = "malmoi-sidebar-collapsed=; Path=/; Max-Age=0";
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() { return query === WIDE_QUERY ? wide : false; },
    addEventListener: (type: string, listener: Listener) => { if (query === WIDE_QUERY && type === "change") listeners.add(listener); },
    removeEventListener: (_type: string, listener: Listener) => { listeners.delete(listener); },
  }));
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe() {
      observe = async (width: number) => {
        await act(async () => { this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver); });
      };
    }
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

function Counter() {
  const [n, setN] = useState(0);
  return <button type="button" data-counter onClick={() => setN(n + 1)}>{n}</button>;
}
function Probe() {
  const { collapsed } = useSidebarCollapse();
  return <aside data-collapsed={String(collapsed)} />;
}
const mount = (initialCollapsed = false) => render(<ShellPanels initialCollapsed={initialCollapsed} sidebar={<Probe />}><Counter /></ShellPanels>);
/** 그룹 폭 → 셸이 쓰는 가용 폭(핸들 8을 뺀다). */
const group = (width: number) => observe?.(width + SHELL_HANDLE_PX);

describe("셸 패널 — 좁은 모드", () => {
  it("폭이 오가도 콘텐츠가 재마운트되지 않는다", async () => {
    await mount();
    const counter = document.querySelector<HTMLButtonElement>("[data-counter]")!;
    await act(async () => { await userEvent.setup().click(counter); });
    await group(1000);
    await setWide(false);
    await group(700);
    await setWide(true);
    await group(1000);
    expect(document.querySelector("[data-counter]")).toBe(counter);
    expect(counter.textContent).toBe("1");
  });

  it("넓은 모드의 폭 변화는 지금처럼 기억한 px를 그 폭에 맞춘다", async () => {
    await mount();
    await group(1000);
    expect(lib.setLayout).toHaveBeenLastCalledWith([24, 76]);
  });

  it("좁은 동안의 폭 변화는 레이아웃을 건드리지 않고, 넓어지면 그때의 폭에 다시 맞춘다", async () => {
    wide = false;
    await mount();
    await group(700);
    await group(600);
    expect(lib.setLayout).not.toHaveBeenCalled();
    // ③ 좁아진 폭에서 최소가 올라 대역이 재검증 `onResize`를 냈다(몫이 최소로 올라감) — 그래도 접힘·쿠키는 그대로다.
    expect(lib.size).toBe(panelPercent(600, 200));
    expect(document.querySelector("aside")?.dataset.collapsed).toBe("false");
    expect(document.cookie).not.toContain("malmoi-sidebar-collapsed");
    await group(1200);
    expect(lib.setLayout).not.toHaveBeenCalled();
    await setWide(true);
    expect(lib.setLayout).toHaveBeenLastCalledWith([20, 80]);
  });

  it("넓어진 뒤에 폭이 와도(순서가 반대) 그 폭에 맞춘다", async () => {
    wide = false;
    await mount();
    await group(700);
    await setWide(true);
    await group(1200);
    expect(lib.setLayout).toHaveBeenLastCalledWith([20, 80]);
  });

  it("좁은 동안의 `onResize`(자동 보정)는 접힘·쿠키를 바꾸지 않는다 — 넓어지면 펼친 240으로 돌아온다", async () => {
    await mount();
    await group(1000);
    await setWide(false);
    await act(async () => lib.onResize?.(panelPercent(1000, SHELL_SIDEBAR_COLLAPSED_PX)));
    expect(document.querySelector("aside")?.dataset.collapsed).toBe("false");
    expect(document.cookie).not.toContain("malmoi-sidebar-collapsed");
    await setWide(true);
    expect(lib.setLayout).toHaveBeenLastCalledWith([24, 76]);
  });

  it("넓힘이 부른 `setLayout`이 `onResize`로 돌아와도 선호폭·쿠키가 그대로다 — 좁혔다 넓히기를 두 번 해도 같은 240", async () => {
    await mount();
    await group(1000);
    expect(lib.setLayout).toHaveBeenLastCalledWith([24, 76]);
    for (let round = 0; round < 2; round += 1) {
      await setWide(false);
      await group(700);
      await setWide(true);
      expect(lib.setLayout).toHaveBeenLastCalledWith([panelPercent(700, 240), 100 - panelPercent(700, 240)]);
      await group(1000);
      expect(lib.setLayout).toHaveBeenLastCalledWith([24, 76]);
    }
    expect(document.querySelector("aside")?.dataset.collapsed).toBe("false");
    expect(document.cookie).not.toContain("malmoi-sidebar-collapsed");
  });

  it("아주 좁아져 재검증이 접힘으로 스냅해도 사용자의 접힘이 아니다 — 넓어지면 펼친 240", async () => {
    wide = false;
    await mount();
    await group(700);
    await group(150);
    expect(lib.size).toBe(panelPercent(150, SHELL_SIDEBAR_COLLAPSED_PX));
    expect(document.querySelector("aside")?.dataset.collapsed).toBe("false");
    expect(document.cookie).not.toContain("malmoi-sidebar-collapsed");
    await setWide(true);
    await group(1000);
    expect(lib.setLayout).toHaveBeenLastCalledWith([24, 76]);
  });

  it("마운트 때의 `onResize`는 쿠키를 쓰지 않는다 — 접어 둔 셸도 펼친 셸도", async () => {
    await mount(true);
    expect(lib.onResize).not.toBeNull();
    expect(document.cookie).not.toContain("malmoi-sidebar-collapsed");
    await mount(false);
    expect(document.cookie).not.toContain("malmoi-sidebar-collapsed");
  });

  it("접어 둔 사용자는 넓어지면 접힌 40으로 돌아온다", async () => {
    await mount(true);
    await setWide(false);
    await group(700);
    await setWide(true);
    expect(lib.setLayout).toHaveBeenLastCalledWith([panelPercent(700, SHELL_SIDEBAR_COLLAPSED_PX), 100 - panelPercent(700, SHELL_SIDEBAR_COLLAPSED_PX)]);
  });

  it("넓은 모드의 `onResize` 스냅은 지금처럼 사용자의 접힘이다", async () => {
    await mount();
    await group(1000);
    await act(async () => lib.onResize?.(panelPercent(1000, SHELL_SIDEBAR_COLLAPSED_PX)));
    expect(document.querySelector("aside")?.dataset.collapsed).toBe("true");
    expect(document.cookie).toContain("malmoi-sidebar-collapsed=1");
  });
});
