// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NAVIGATION_DIM_GIVE_UP_MS, NavigationDim } from "@/components/shell/navigation-dim";
import { render } from "./helpers/dom";

/**
 * **다른 화면으로 가는 클릭은 응답 전에 뷰포트 전체를 흐린다** (2026-09-29 사용자 — prod에서 0.5–1초 동안 누른 게 맞나
 * 헷갈렸다). 켜짐은 클릭, 꺼짐은 pathname 커밋이다. jsdom은 이동하지 않으므로 pathname을 손으로 옮긴다.
 */
const path = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.value }));

// jsdom의 anchor 기본 동작(이동 미구현 경고)을 막는다 — 실물에선 Next Link가 막는다.
const stopNavigation = (event: MouseEvent) => event.preventDefault();
beforeEach(() => { path.value = "/"; document.addEventListener("click", stopNavigation); });
afterEach(() => { document.removeEventListener("click", stopNavigation); vi.useRealTimers(); });

const dim = () => document.querySelector("[data-navigation-dim]")!;
const anchor = (href: string, attrs: Record<string, string> = {}) => {
  const a = document.createElement("a");
  a.href = href;
  for (const [name, value] of Object.entries(attrs)) a.setAttribute(name, value);
  a.append(document.createElement("span"));
  document.body.append(a);
  return a;
};
const press = async (target: Element, init: MouseEventInit = {}) => {
  await act(async () => { target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init })); });
};

describe("NavigationDim", () => {
  it("다른 pathname으로 가는 링크를 누르면 켜지고, pathname이 바뀌면 꺼진다", async () => {
    const { rerender } = await render(<NavigationDim />);
    expect(dim().hasAttribute("data-active")).toBe(false);
    // 링크 자손을 눌러도 링크의 이동이다.
    await press(anchor("/projects").firstElementChild!);
    expect(dim().hasAttribute("data-active")).toBe(true);
    path.value = "/projects";
    await rerender(<NavigationDim />);
    expect(dim().hasAttribute("data-active")).toBe(false);
  });

  it("클릭을 가로채지 않는다 — 포인터가 통과하고 보조 기술에 숨는다", async () => {
    await render(<NavigationDim />);
    expect(dim().className).toContain("pointer-events-none");
    expect(dim().getAttribute("aria-hidden")).toBe("true");
  });

  it("짧은 이동에서 깜빡이지 않게 켜질 때만 지연을 둔다", async () => {
    await render(<NavigationDim />);
    expect(dim().className).toContain("data-[active]:delay-150");
    expect(dim().className).not.toMatch(/(^|\s)delay-/);
  });

  it("쿼리만 바뀌는 링크·새 탭 클릭은 켜지 않는다", async () => {
    await render(<NavigationDim />);
    await press(anchor("/?event=e1"));
    await press(anchor("/projects"), { metaKey: true });
    await press(anchor("/projects", { target: "_blank" }));
    expect(dim().hasAttribute("data-active")).toBe(false);
  });

  it("다른 리스너가 전파를 끊은 클릭(이탈 guard)은 켜지 않는다", async () => {
    const guard = (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); };
    document.addEventListener("click", guard, true);
    try {
      await render(<NavigationDim />);
      await press(anchor("/projects"));
      expect(dim().hasAttribute("data-active")).toBe(false);
    } finally {
      document.removeEventListener("click", guard, true);
    }
  });

  it("커밋이 오지 않으면(같은 화면으로 redirect 등) 한도 뒤에 스스로 꺼진다", async () => {
    vi.useFakeTimers();
    await render(<NavigationDim />);
    await press(anchor("/projects"));
    expect(dim().hasAttribute("data-active")).toBe(true);
    await act(async () => { vi.advanceTimersByTime(NAVIGATION_DIM_GIVE_UP_MS); });
    expect(dim().hasAttribute("data-active")).toBe(false);
  });
});
