// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SHELL_SIDEBAR_COLLAPSED_PX, ShellPanels } from "@/components/shell/shell-panels";
import { Sidebar } from "@/components/shell/sidebar";
import { SidebarCollapseContext } from "@/components/shell/sidebar-collapse";
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
