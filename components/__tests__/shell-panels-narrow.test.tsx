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
type PanelProps = { children: ReactNode; className?: string; style?: React.CSSProperties; onResize?: (size: number) => void; defaultSize?: number; minSize?: number; collapsedSize?: number; collapsible?: boolean };
const lib = vi.hoisted(() => ({ setLayout: vi.fn(), onResize: null as ((size: number) => void) | null, size: 0 }));
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: forwardRef<{ setLayout: (layout: number[]) => void }, { children: ReactNode }>(function Group({ children }, ref) {
    useImperativeHandle(ref, () => ({ setLayout: lib.setLayout }));
    return <div data-group>{children}</div>;
  }),
  ResizablePanel: function Panel({ children, className, style, onResize, defaultSize, minSize, collapsedSize, collapsible }: PanelProps) {
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
    return <div data-panel={tracked ? "sidebar" : "content"} className={className} style={style}>{children}</div>;
  },
  ResizableHandle: ({ className }: { className?: string }) => <div role="separator" className={className} />,
}));

type Listener = (event: { matches: boolean }) => void;
const listeners = new Set<Listener>();
let wide = true;
/**
 * 셸이 재는 그룹 래퍼의 지금 폭 — 실제 브라우저에서는 `matchMedia` `change` 순간에도 `getBoundingClientRect`가 새 뷰포트 폭을 낸다
 * (ResizeObserver 콜백보다 먼저 올 수 있고, 탭이 가려져 있으면 RO가 한참 늦는다 — #225 실측).
 */
let groupRect = 0;
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
beforeEach(() => {
  groupRect = 0;
  const rect = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    // 셸이 재는 래퍼 = 대역 그룹(`data-group`)의 부모.
    if (this.firstElementChild?.hasAttribute("data-group")) return { width: groupRect, height: 0, x: 0, y: 0, top: 0, left: 0, right: groupRect, bottom: 0, toJSON: () => ({}) } as DOMRect;
    return rect.call(this);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function Counter() {
  const [n, setN] = useState(0);
  return <button type="button" data-counter onClick={() => setN(n + 1)}>{n}</button>;
}
function Probe() {
  const { collapsed } = useSidebarCollapse();
  return <aside data-collapsed={String(collapsed)} />;
}
const mount = (initialCollapsed = false) => render(<ShellPanels initialCollapsed={initialCollapsed} sidebar={<Probe />}><Counter /></ShellPanels>);
/** 그룹 폭 → 셸이 쓰는 가용 폭(핸들 8을 뺀다). 래퍼의 지금 폭도 같이 바뀐다(RO가 오는 것은 그 뒤다). */
const group = (width: number) => { groupRect = width + SHELL_HANDLE_PX; return observe?.(width + SHELL_HANDLE_PX); };
/** 뷰포트만 바뀌고 RO는 아직 안 온 순간 — 래퍼 폭만 새 값이다. */
const resizeOnly = (width: number) => { groupRect = width + SHELL_HANDLE_PX; };
const sidebarPanel = () => document.querySelector<HTMLElement>('[data-panel="sidebar"]')!;

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
    expect(document.querySelector("aside")?.dataset.collapsed).toBe("false");
    expect(document.cookie).not.toContain("malmoi-sidebar-collapsed");
    await group(1200);
    expect(lib.setLayout).not.toHaveBeenCalled();
    await setWide(true);
    expect(lib.setLayout).toHaveBeenLastCalledWith([20, 80]);
  });

  /**
   * **#225** — 좁은 폭으로 처음 연 뒤 넓히면 LNB가 240이 아니었다(1024에서 429 실측). 좁은 동안 잰 폭이 제약(`minSize` 200 = 351의 57%)에 들어가
   * 라이브러리가 몫을 57%로 끌어올렸고, 넓어지는 순간 CSS가 그 57%를 먼저 그렸다. 이어 `matchMedia` 복원은 **좁을 때 잰 옛 폭(351)**으로
   * 240을 % 환산해(68%) 세웠다 — RO가 늦으면 그 틀린 폭이 남는다.
   * 고친 계약: 좁은 동안 잰 폭은 버리고(제약이 움직이지 않는다 — 재기 전이면 240px 고정 그대로), 넓어지는 순간 래퍼를 그 자리에서 재어 맞춘다.
   */
  it("좁은 폭으로 처음 열고 넓히면 240이다 — 좁을 때 잰 폭으로 환산하지 않는다 (#225)", async () => {
    wide = false;
    await mount();
    await group(351);
    // 좁은 동안 잰 폭이 제약에 안 들어간다 — 재기 전 고정(240px)이 그대로고, 재검증 `onResize`도 없다.
    expect(sidebarPanel().style.flexBasis).toBe("240px");
    expect(lib.size).toBe(panelPercent(1280 - 16 - SHELL_HANDLE_PX, 240));
    // 뷰포트가 1024가 됐고 RO는 아직이다 — `change`가 먼저 온다.
    resizeOnly(1000);
    await setWide(true);
    // `change`의 즉시 복원과 그 폭이 든 `available` 갱신이 둘 다 같은 값을 낸다 — 어느 호출도 옛 폭으로 환산하지 않는다.
    expect(lib.setLayout.mock.calls.map(([layout]) => layout)).toEqual(lib.setLayout.mock.calls.map(() => [24, 76]));
    expect(lib.setLayout).toHaveBeenCalled();
    await group(1000);
    expect(lib.setLayout).toHaveBeenLastCalledWith([24, 76]);
    await group(1256);
    expect(lib.setLayout).toHaveBeenLastCalledWith([panelPercent(1256, 240), 100 - panelPercent(1256, 240)]);
  });

  it("넓게 쓰다 좁혔다 넓혀도 좁은 동안 잰 폭이 제약을 움직이지 않는다", async () => {
    await mount();
    await group(1000);
    lib.setLayout.mockClear();
    await setWide(false);
    await group(351);
    expect(lib.size).toBe(24);
    resizeOnly(1000);
    await setWide(true);
    expect(lib.setLayout).toHaveBeenLastCalledWith([24, 76]);
    expect(lib.setLayout).not.toHaveBeenCalledWith([panelPercent(351, 240), 100 - panelPercent(351, 240)]);
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
