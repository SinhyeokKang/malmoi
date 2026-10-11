// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toc } from "@/components/public-doc-toc";
import { find, render } from "./helpers/dom";

const ITEMS = [{ id: "first", heading: "First" }, { id: "second", heading: "Second" }, { id: "last", heading: "Last" }];
let width = 959;
let frames: FrameRequestCallback[];
let observers: { targets: Set<Element>; callback: ResizeObserverCallback; disconnected: boolean }[];
const nativeStyle = window.getComputedStyle;

beforeEach(() => {
  width = 959;
  frames = [];
  observers = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("ResizeObserver", class {
    entry: typeof observers[number];
    constructor(callback: ResizeObserverCallback) {
      this.entry = { targets: new Set(), callback, disconnected: false };
      observers.push(this.entry);
    }
    observe(target: Element) { this.entry.targets.add(target); }
    disconnect() { this.entry.disconnected = true; }
  });
  // CSS 쿼리 계산은 브라우저 QA 몫이다. 여기서는 읽기 그릇만 바꿔 숨김과 알림 순서를 재현한다.
  vi.stubGlobal("getComputedStyle", (node: Element) => {
    const style = nativeStyle(node);
    if (node.matches("nav button")) return { ...style, display: width >= 960 ? "none" : "flex" };
    if (node.matches("nav > div")) return { ...style, display: width >= 960 || node.classList.contains("block") ? "block" : "none" };
    return style;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const scroller = this.closest<HTMLElement>("[data-public-scroller]");
    const index = ITEMS.findIndex(({ id }) => this.id === id);
    const expanded = scroller?.querySelector("button")?.getAttribute("aria-expanded") === "true";
    const shift = width < 960 && expanded ? 240 : 0;
    return { top: index < 0 ? 0 : 200 + index * 600 + shift - (scroller?.scrollTop ?? 0), width, height: 600 } as DOMRect;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function flush() {
  await act(async () => { for (const callback of frames.splice(0)) callback(0); });
}
async function resize(...targets: Element[]) {
  await act(async () => {
    for (const observer of observers) {
      const changed = targets.filter((target) => observer.targets.has(target));
      if (!observer.disconnected && changed.length) observer.callback(changed.map((target) => ({ target })) as ResizeObserverEntry[], {} as ResizeObserver);
    }
  });
  await flush();
}
async function mount(kind: "docs" | "privacy" = "docs") {
  const { container, rerender } = await render(
    <div data-public-scroller="">
      <button data-outside="">Outside</button>
      <div className="@container/reading">
        <div>
          <Toc label="On this page" items={ITEMS} />
          <article>{ITEMS.map(({ id, heading }) => kind === "docs"
            ? <h2 key={id} id={id} tabIndex={-1}>{heading}</h2>
            : <section key={id}><h2 id={id} tabIndex={-1}>{heading}</h2></section>)}</article>
        </div>
      </div>
    </div>,
  );
  const scroller = find<HTMLElement>(container, "[data-public-scroller]");
  Object.defineProperty(scroller, "clientHeight", { value: 600 });
  Object.defineProperty(scroller, "scrollHeight", { value: 2600 });
  scroller.scrollTo = vi.fn(({ top }: ScrollToOptions) => { scroller.scrollTop = top ?? 0; });
  await flush();
  return {
    container, scroller, rerender,
    nav: find<HTMLElement>(container, "nav"),
    reading: find<HTMLElement>(container, '[class="@container/reading"]'),
    toggle: find<HTMLButtonElement>(container, "nav button"),
    second: find<HTMLAnchorElement>(container, 'a[href="#second"]'),
    outside: find<HTMLButtonElement>(container, "[data-outside]"),
  };
}
const current = (container: HTMLElement) => container.querySelector('[aria-current="location"]')?.getAttribute("href");
async function scroll(scroller: HTMLElement, top: number) {
  await act(async () => { scroller.scrollTop = top; scroller.dispatchEvent(new Event("scroll")); });
  await flush();
}

// Chrome은 display:none 뒤 blur 없이 body로 옮긴다. blur()로 흉내 내면 바로 그 결함을 놓친다.
async function cross(nextWidth: number, reading: HTMLElement, lostFocus = false) {
  width = nextWidth;
  const fixup = lostFocus ? vi.spyOn(document, "activeElement", "get").mockReturnValue(document.body) : null;
  await resize(reading);
  fixup?.mockRestore();
}

describe("TOC — 고정 스크롤러 안의 실제 변경 순서", () => {
  it.each(["docs", "privacy"] as const)("%s: 펼침 → 착지 → 고정 해제 → 접힘 뒤에도 새 좌표로 현재 절을 고른다", async (kind) => {
    const { container, scroller, nav, reading, toggle, second } = await mount(kind);
    await scroll(scroller, 850);
    expect(current(container)).toBe("#second");
    await act(async () => { toggle.click(); });
    // 스크롤러 content box는 그대로다. 높이가 달라진 TOC/읽기 그릇만 알린다.
    await resize(nav, reading);
    expect(current(container)).toBe("#first");
    await act(async () => { second.click(); });
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 1040 - 48, behavior: "smooth" });
    expect(document.activeElement?.id).toBe("second");
    await scroll(scroller, 850);
    expect(current(container)).toBe("#second");
    await act(async () => { scroller.dispatchEvent(new Event("wheel")); });
    await flush();
    expect(current(container)).toBe("#first");
    await act(async () => { toggle.click(); });
    await resize(nav, reading);
    expect(current(container)).toBe("#second");
    expect(observers).toHaveLength(1);
  });

  it.each([false, true])("읽기 그릇 960 양방향에서 숨은 포커스만 이관한다 — Chrome fixup=%s", async (fixup) => {
    width = 960;
    const { container, reading, nav, toggle, second } = await mount();
    await scroll(find(container, "[data-public-scroller]"), 850);
    await act(async () => { second.focus(); });
    const buttonFocus = vi.spyOn(toggle, "focus");
    await cross(959, reading, fixup);
    expect(buttonFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // body 스텁은 focus() 효과도 가린다. 다음 단계는 실제 새 소유자에서 시작한다.
    await act(async () => { toggle.focus(); });
    const linkFocus = vi.spyOn(second, "focus");
    await cross(960, reading, fixup);
    expect(linkFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(find(container, "nav")).toBe(nav);
    expect(observers).toHaveLength(1);
  });

  it("열림 선호·보이는 링크·외부 포커스와 명시적 blur를 보존하고 관찰을 정리한다", async () => {
    const { reading, toggle, second, outside, rerender } = await mount();
    await act(async () => { toggle.click(); second.focus(); });
    await cross(960, reading);
    await cross(959, reading);
    expect(document.activeElement).toBe(second);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(async () => { toggle.focus(); outside.focus(); });
    await cross(960, reading);
    expect(document.activeElement).toBe(outside);
    await act(async () => { second.focus(); second.blur(); });
    await cross(959, reading);
    expect(document.activeElement).toBe(document.body);
    await rerender(<div />);
    expect(observers.every(({ disconnected }) => disconnected)).toBe(true);
  });
});
