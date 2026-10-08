// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { setUnread } from "@/lib/inbox/unread-store";

import { SHELL_SIDEBAR_COLLAPSED_PX, ShellPanels } from "@/components/shell/shell-panels";
import { Sidebar } from "@/components/shell/sidebar";
import { SidebarCollapseContext, useSidebarCollapse } from "@/components/shell/sidebar-collapse";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

vi.mock("next/navigation", () => ({ usePathname: () => "/projects/beta" }));

const memberships = [{ slug: "beta", name: "Beta", role: "OWNER" as const, archived: false, image: null }];

function sidebar(collapsed: boolean, toggle = () => {}) {
  return render(
    <SidebarCollapseContext.Provider value={{ collapsed, toggle }}>
      <Sidebar memberships={memberships} userName="Kim" />
    </SidebarCollapseContext.Provider>,
  );
}

const toggleButton = (container: HTMLElement) =>
  [...container.querySelectorAll("aside button")].find((b) => b.getAttribute("aria-expanded") !== null && b.textContent?.includes("sidebar"));

/**
 * **LNB 접기** (2026-09-28 사용자 — 8-3이 지운 접기가 돌아왔다). 접히면 32 칸의 아이콘만 남고, 사용자·프로젝트 이름 줄이 사라지고,
 * 두 구역 사이 수평선은 남는다. 토글은 LNB 맨 아래다.
 */
describe("사이드바 — 접기", () => {
  it("토글은 LNB 맨 아래이고 상태를 `aria-expanded`로 말한다", async () => {
    const { container } = await sidebar(false);
    const button = toggleButton(container);
    expect(button?.textContent).toBe(en.common.nav.collapseSidebar);
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    const footer = container.querySelector('[data-sidebar-zone="footer"]');
    expect(footer?.lastElementChild).toBe(button);
  });

  it("누르면 셸의 토글을 부른다", async () => {
    const toggle = vi.fn();
    const { container } = await sidebar(false, toggle);
    await act(async () => (toggleButton(container) as HTMLElement).click());
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("접히면 구역 머리가 0 높이로 접히고 Tab 순서에서 빠진다 — 구역 사이 선은 남는다", async () => {
    const { container } = await sidebar(true);
    for (const head of container.querySelectorAll("[data-zone-head]")) {
      const fold = head.parentElement?.parentElement;
      expect(fold?.className).toContain("grid-rows-[0fr]");
      expect(fold?.hasAttribute("inert")).toBe(true);
    }
    expect(container.querySelector('nav[aria-label="Beta"]')?.className).toContain("border-t");
  });

  it("접혀도 항목 이름이 DOM에 남아 접근 이름이 되고, 보이는 이름은 `title`이 든다", async () => {
    const { container } = await sidebar(true);
    const home = [...container.querySelectorAll('nav[aria-label="Beta"] a')][0];
    expect(home?.textContent).toContain(en.common.nav.home);
    expect(home?.getAttribute("title")).toBe(en.common.nav.home);
    expect(toggleButton(container)?.getAttribute("aria-expanded")).toBe("false");
    expect(toggleButton(container)?.textContent).toBe(en.common.nav.expandSidebar);
  });

  /**
   * 접힌 레일의 프로젝트 트리거 (2026-10-04 사용자) — 머리 줄 대신 토글과 같은 틀의 ghost 버튼이 썸네일을 아이콘으로 들고,
   * 누르면 전환 메뉴가 열린다. 펼침에서는 접혀 Tab 순서에서 빠진다.
   */
  const railTrigger = (container: HTMLElement) => container.querySelector<HTMLButtonElement>("[data-zone-rail] button");

  it("접히면 썸네일 아이콘 버튼이 서고, 누르면 프로젝트 전환 메뉴가 열린다", async () => {
    const { container } = await sidebar(true);
    const button = railTrigger(container)!;
    expect(button.getAttribute("aria-label")).toBe(en.common.nav.projectSwitcher.label);
    expect(button.getAttribute("title")).toBe("Beta");
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.closest("[inert]")).toBeNull();
    // 펼친 머리의 스위처와 같은 틀 — 토글 버튼과 같은 클래스 묶음이다.
    expect(button.className).toBe(toggleButton(container)?.className);
    const user = userEvent.setup();
    await act(async () => user.click(button));
    expect(document.querySelector('[role="menu"] input')).not.toBeNull();
    // 레일에서는 오른쪽으로 연다 — 아래로 열면 레일 항목을 덮는다(2026-10-04 사용자).
    expect(document.querySelector('[role="menu"]')?.getAttribute("data-side")).toBe("right");
  });

  it("펼침에서는 레일 트리거가 0 높이로 접혀 Tab 순서에서 빠진다", async () => {
    const { container } = await sidebar(false);
    const fold = container.querySelector("[data-zone-rail]")?.parentElement;
    expect(fold?.className).toContain("grid-rows-[0fr]");
    expect(fold?.hasAttribute("inert")).toBe(true);
  });

  it("펼침에는 `title`이 없다 — 라벨이 이미 보인다", async () => {
    const { container } = await sidebar(false);
    expect(container.querySelector('nav[aria-label="Beta"] a')?.hasAttribute("title")).toBe(false);
  });
});

describe("셸 패널 — 접기", () => {
  it("접힌 폭은 32 칸 + 좌우 4 = 40이다", () => {
    expect(SHELL_SIDEBAR_COLLAPSED_PX).toBe(40);
  });

  /** 패널이 `overflow: visible`이라 `min-w-0`이 없으면 flex 최소 폭이 라벨 한 줄 폭이 되어 40까지 못 줄어든다(실측 167). */
  it("LNB 패널이 `min-w-0`을 든다", async () => {
    const { container } = await render(<ShellPanels sidebar={<aside data-test="sidebar" />}>{<main />}</ShellPanels>);
    expect(container.querySelector('[data-test="sidebar"]')?.parentElement?.className).toContain("min-w-0");
  });
});

/**
 * **접힘 여부는 기기 쿠키에 남는다** (2026-10-07 사용자) — 서버 렌더가 쿠키를 읽어 `initialCollapsed`로 넘기면 첫 페인트부터 접힌 셸이다.
 * 쓰는 것은 사용자의 토글·드래그뿐이다 — 마운트·창 크기 변화는 쓰지 않는다. 폭은 저장하지 않는다.
 */
describe("셸 패널 — 접힘 쿠키", () => {
  function Probe() {
    const { collapsed, toggle } = useSidebarCollapse();
    return (
      <aside data-test="sidebar" data-collapsed={String(collapsed)}>
        <button type="button" onClick={toggle}>
          toggle
        </button>
      </aside>
    );
  }

  const clearCookie = () => {
    document.cookie = "malmoi-sidebar-collapsed=; Path=/; Max-Age=0";
  };
  beforeEach(clearCookie);

  it("`initialCollapsed`면 첫 렌더부터 접혀 있다 — 재기 전 폭도 40px다", async () => {
    const { container } = await render(<ShellPanels initialCollapsed sidebar={<Probe />}>{<main />}</ShellPanels>);
    const aside = container.querySelector<HTMLElement>('[data-test="sidebar"]');
    expect(aside?.dataset.collapsed).toBe("true");
    expect(aside?.parentElement?.style.flexBasis).toBe(`${SHELL_SIDEBAR_COLLAPSED_PX}px`);
  });

  it("쿠키가 없던 셸은 펼침이고 240px다", async () => {
    const { container } = await render(<ShellPanels initialCollapsed={false} sidebar={<Probe />}>{<main />}</ShellPanels>);
    const aside = container.querySelector<HTMLElement>('[data-test="sidebar"]');
    expect(aside?.dataset.collapsed).toBe("false");
    expect(aside?.parentElement?.style.flexBasis).toBe("240px");
  });

  it("마운트만으로는 쿠키를 쓰지 않는다", async () => {
    await render(<ShellPanels initialCollapsed sidebar={<Probe />}>{<main />}</ShellPanels>);
    expect(document.cookie).not.toContain("malmoi-sidebar-collapsed");
  });

  /**
   * **핸들 Enter는 버튼 토글과 같은 길을 탄다** (2026-10-07 실측) — `react-resizable-panels` 2.1.9의 Enter는 그룹 상태만 바꾸고 패널의
   * `onResize`를 부르지 않아, 폭만 199가 되고 셸의 접힘 상태·쿠키는 그대로였다. 셸이 capture 단계에서 먼저 받아 `toggle`을 부른다.
   */
  it("핸들에서 Enter를 누르면 토글한다 — 라이브러리의 Enter는 막는다", async () => {
    const swallow = (event: ErrorEvent) => {
      if (/Invalid \d+ panel layout/.test(event.message)) event.preventDefault();
    };
    window.addEventListener("error", swallow);
    onTestFinished(() => window.removeEventListener("error", swallow));
    const { container } = await render(<ShellPanels initialCollapsed={false} sidebar={<Probe />}>{<main />}</ShellPanels>);
    const handle = container.querySelector<HTMLElement>('[role="separator"]')!;
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => handle.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(document.cookie).toContain("malmoi-sidebar-collapsed=1");
  });

  it("핸들의 다른 키는 가로채지 않는다", async () => {
    const { container } = await render(<ShellPanels initialCollapsed={false} sidebar={<Probe />}>{<main />}</ShellPanels>);
    const handle = container.querySelector<HTMLElement>('[role="separator"]')!;
    const event = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true });
    await act(async () => handle.dispatchEvent(event));
    expect(document.cookie).not.toContain("malmoi-sidebar-collapsed");
  });

  it("토글하면 바뀐 상태를 쿠키에 쓴다 — 펼침에서 접으면 1, 접힘에서 펴면 0", async () => {
    // jsdom에는 패널 치수가 없어 라이브러리의 `setLayout`이 "Invalid 0 panel layout"을 던진다 — 쿠키는 그 전에 쓴다.
    // 그 한 메시지만 삼킨다(실제 브라우저에는 없는 조건이고, 드래그·배치는 jsdom이 판정하지 못한다 — vitest.setup.ts).
    const swallow = (event: ErrorEvent) => {
      if (/Invalid \d+ panel layout/.test(event.message)) event.preventDefault();
    };
    window.addEventListener("error", swallow);
    onTestFinished(() => window.removeEventListener("error", swallow));
    const expanded = await render(<ShellPanels initialCollapsed={false} sidebar={<Probe />}>{<main />}</ShellPanels>);
    await act(async () => expanded.container.querySelector<HTMLButtonElement>('[data-test="sidebar"] button')?.click());
    expect(document.cookie).toContain("malmoi-sidebar-collapsed=1");

    clearCookie();
    const collapsed = await render(<ShellPanels initialCollapsed sidebar={<Probe />}>{<main />}</ShellPanels>);
    await act(async () => collapsed.container.querySelector<HTMLButtonElement>('[data-test="sidebar"] button')?.click());
    expect(document.cookie).toContain("malmoi-sidebar-collapsed=0");
  });
});

// 안 읽음 수는 모듈 store라 파일 안 테스트 사이로 샌다(inbox-page D2) — 헤더·사이드바를 그리는 파일은 매번 되돌린다.
afterEach(() => { setUnread(0); });
