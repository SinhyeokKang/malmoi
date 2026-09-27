// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toc } from "@/components/public-doc-toc";
import { currentSection } from "@/lib/public-doc/toc";

import { find, render } from "./helpers/dom";

/**
 * `/privacy` 목차의 배선 (DESIGN §6.616). 판정은 `currentSection`이 들고 여기서는 그 값이 DOM에 서는지만 본다.
 *
 * ⚠️ **스텁 없이는 분기가 안 돈다** (POSTMORTEM 2026-09-23) — jsdom에는 `matchMedia`도 rAF 큐도 없고
 * `vitest.setup.ts`의 `ResizeObserver`는 콜백을 부르지 않는다. 셋 다 여기서 세운다.
 */
const ITEMS = [
  { id: "collected", heading: "What we collect" },
  { id: "purposes", heading: "Why" },
  { id: "cookies", heading: "Cookies" },
] as const;
/** 절 윗변의 스크롤러 좌표. */
const TOPS = [200, 800, 1400];
/**
 * 스크롤러 끝(`scrollHeight − clientHeight`). ⚠️ 마지막 절 윗변(1400 − 96 = 1304)이 여기 **못 닿게** 잡았다 —
 * 짧은 마지막 절이 끝까지 내려도 강조되지 않던 실측(1440×900)을 재현한다.
 */
const MAX = 1200;

let queue: FrameRequestCallback[] = [];
let cancelled: number[] = [];
let observers: { disconnected: boolean }[] = [];
let reduced = false;

beforeEach(() => {
  queue = [];
  cancelled = [];
  observers = [];
  reduced = false;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => queue.push(callback));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { cancelled.push(id); });
  vi.stubGlobal("ResizeObserver", class {
    entry = { disconnected: false };
    constructor() { observers.push(this.entry); }
    observe() {}
    unobserve() {}
    disconnect() { this.entry.disconnected = true; }
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") && reduced, media: query, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => { vi.unstubAllGlobals(); });

async function flush() {
  await act(async () => {
    for (let guard = 0; queue.length > 0 && guard < 10; guard += 1) for (const callback of queue.splice(0)) callback(0);
  });
}

const originalRect = HTMLElement.prototype.getBoundingClientRect;

/** 절 h2의 스크롤러 기준 윗변을 `TOPS − scrollTop`에 둔다 — 측정은 effect·핸들러가 그때그때 한다. */
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.dataset.testid === "scroller") return { top: 0 } as DOMRect;
    const scroller = this.closest<HTMLElement>("[data-public-scroller]");
    const index = ITEMS.findIndex((item) => item.id === this.id);
    if (index >= 0 && scroller) return { top: (TOPS[index] ?? 0) - scroller.scrollTop } as DOMRect;
    return originalRect.call(this);
  };
});

afterEach(() => { HTMLElement.prototype.getBoundingClientRect = originalRect; });

/** 스크롤러가 마운트 전에 있어야 effect가 `closest`로 찾는다 — 한 트리로 그린다. */
async function mount() {
  const { container, rerender } = await render(
    <div data-testid="scroller" data-public-scroller="">
      {ITEMS.map((item) => <h2 key={item.id} id={item.id} tabIndex={-1}>{item.heading}</h2>)}
      <Toc label="On this page" items={ITEMS} />
    </div>,
  );
  const scroller = find<HTMLElement>(container, "[data-testid=scroller]");
  Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => 600 });
  Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => MAX + 600 });
  // 스크롤러는 남기고 목차만 내린다 — 스크롤러에 건 구독을 걷는지 본다.
  const unmount = () => rerender(<div data-testid="scroller" data-public-scroller="" />);
  return { container, scroller, unmount };
}

async function scrollTo(scroller: HTMLElement, top: number) {
  scroller.scrollTop = top;
  await act(async () => { scroller.dispatchEvent(new Event("scroll")); });
  await flush();
}

const currentIds = (container: HTMLElement) =>
  [...container.querySelectorAll('nav a[aria-current="location"]')].map((a) => a.getAttribute("href"));

describe("Toc — 구조", () => {
  it("이름 있는 nav 안에 절마다 `href=\"#id\"` 링크가 선다 — JS 없이도 이동한다", async () => {
    const { container } = await mount();
    const nav = find(container, "nav");
    const labelled = nav.getAttribute("aria-labelledby");
    expect(labelled && document.getElementById(labelled)?.textContent).toBe("On this page");
    expect([...nav.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")])).toEqual(
      ITEMS.map((item) => [item.heading, `#${item.id}`]),
    );
  });
});

describe("Toc — 현재 절", () => {
  it("스크롤 위치의 절 하나만 `aria-current=\"location\"`이다", async () => {
    const { container, scroller } = await mount();
    await flush();
    expect(currentIds(container)).toEqual(["#collected"]);
    for (const top of [0, 800 - 96, 1000, MAX]) {
      await scrollTo(scroller, top);
      const expected = ITEMS[currentSection(TOPS, top, 96, MAX)]?.id;
      expect(currentIds(container)).toEqual([`#${expected}`]);
    }
  });

  it("끝까지 내리면 윗변이 기준선에 못 닿은 마지막 절이 현재다", async () => {
    const { container, scroller } = await mount();
    await scrollTo(scroller, MAX - 2);
    expect(currentIds(container)).toEqual(["#purposes"]);
    await scrollTo(scroller, MAX);
    expect(currentIds(container)).toEqual(["#cookies"]);
  });

  it("현재 항목만 선·글자가 foreground다", async () => {
    const { container, scroller } = await mount();
    await scrollTo(scroller, MAX);
    const links = [...container.querySelectorAll<HTMLAnchorElement>("nav a")];
    expect(links.map((a) => a.className.includes("border-foreground"))).toEqual([false, false, true]);
    expect(links.map((a) => a.className.includes("text-muted-foreground"))).toEqual([true, true, false]);
  });
});

describe("Toc — 클릭", () => {
  async function click(reducedMotion: boolean) {
    reduced = reducedMotion;
    const { container, scroller } = await mount();
    scroller.scrollTop = 0;
    const scrollToSpy = vi.fn();
    scroller.scrollTo = scrollToSpy as unknown as HTMLElement["scrollTo"];
    const replace = vi.spyOn(history, "replaceState");
    const link = find<HTMLAnchorElement>(container, 'nav a[href="#cookies"]');
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => { link.dispatchEvent(event); });
    return { scrollToSpy, replace, event };
  }

  it("절이 스크롤러 상단 48 아래에 오도록 부드럽게 스크롤하고 주소의 해시를 바꾼다", async () => {
    const { scrollToSpy, replace, event } = await click(false);
    expect(event.defaultPrevented).toBe(true);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 1400 - 48, behavior: "smooth" });
    expect(replace).toHaveBeenCalledWith(null, "", "#cookies");
    replace.mockRestore();
  });

  /** 네이티브 fragment 이동은 포커스 시작점도 옮긴다 — preventDefault가 그것까지 막으면 키보드가 목차에 남는다. */
  it("포커스가 그 절 제목으로 옮겨 가고, 포커스가 스크롤을 건드리지 않는다", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const { replace } = await click(false);
    expect(document.activeElement?.id).toBe("cookies");
    const target = document.getElementById("cookies");
    const calls = focus.mock.contexts.flatMap((self, index) => (self === target ? [focus.mock.calls[index]] : []));
    expect(calls).toEqual([[{ preventScroll: true }]]);
    focus.mockRestore();
    replace.mockRestore();
  });

  /**
   * 누른 절이 48 자리까지 못 올라오면 스크롤이 끝에서 멈추고, 끝 규칙이 마지막 절을 켠다 — 누른 항목이 아니라
   * `Changes to this policy`가 강조됐다(높은 뷰포트의 뒤쪽 짧은 절). 누른 id는 사용자가 스스로 스크롤할 때까지 이긴다.
   */
  it("착지가 끝에서 멈춰도 누른 절이 현재이고, 사용자가 스크롤하면 위치 판정으로 돌아간다", async () => {
    const { container, scroller } = await mount();
    // 끝 = 700 — `purposes`의 착지(800 − 48 = 752)가 끝 너머다.
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => 700 + 600 });
    scroller.scrollTo = vi.fn() as unknown as HTMLElement["scrollTo"];
    const replace = vi.spyOn(history, "replaceState");
    const link = find<HTMLAnchorElement>(container, 'nav a[href="#purposes"]');
    await act(async () => { link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
    expect(currentIds(container)).toEqual(["#purposes"]);
    await scrollTo(scroller, 700);
    expect(currentIds(container)).toEqual(["#purposes"]);

    await act(async () => { scroller.dispatchEvent(new Event("wheel")); });
    await scrollTo(scroller, 700);
    expect(currentIds(container)).toEqual(["#cookies"]);
    replace.mockRestore();
  });

  it("모션 감소면 smooth가 아니다", async () => {
    const { scrollToSpy, replace } = await click(true);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 1400 - 48, behavior: "auto" });
    replace.mockRestore();
  });
});

describe("Toc — 수정 키·가운데 클릭", () => {
  /** 새 탭·새 창으로 여는 클릭은 브라우저 몫이다 — 가로채면 "새 탭에서 열기"가 현재 탭 스크롤이 된다. */
  it.each([
    ["meta", { metaKey: true }],
    ["ctrl", { ctrlKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["middle", { button: 1 }],
  ] as const)("%s 클릭은 가로채지 않는다", async (_, init) => {
    const { container, scroller } = await mount();
    const scrollToSpy = vi.fn();
    scroller.scrollTo = scrollToSpy as unknown as HTMLElement["scrollTo"];
    const link = find<HTMLAnchorElement>(container, 'nav a[href="#cookies"]');
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
    await act(async () => { link.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});

describe("Toc — 정리", () => {
  it("언마운트하면 스크롤 구독·관찰·예약된 rAF를 걷는다", async () => {
    const { scroller, unmount } = await mount();
    const remove = vi.spyOn(scroller, "removeEventListener");
    scroller.scrollTop = 900;
    await act(async () => { scroller.dispatchEvent(new Event("scroll")); });
    expect(queue.length).toBeGreaterThan(0);
    await unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(observers.every((o) => o.disconnected)).toBe(true);
    expect(cancelled.length).toBeGreaterThan(0);
  });
});
