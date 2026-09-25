// @vitest-environment jsdom
import { act, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Stage } from "@/components/landing/stage";
import { frame, typedPrefix } from "@/lib/landing/stage";

import { find, render } from "./helpers/dom";

/**
 * **랜딩 스테이지의 배선** (landing T6). 수학은 `lib/landing/stage.ts`가 들고 여기서는 그 값이 DOM에
 * 그대로 쓰이는지만 본다 — 기대값을 `frame()`에서 뽑아 식을 두 벌 두지 않는다.
 *
 * ⚠️ **스텁 없이는 분기가 안 돈다** (POSTMORTEM 2026-09-23) — `vitest.setup.ts`의 `ResizeObserver`는 콜백을
 * 한 번도 부르지 않고 jsdom에는 `matchMedia`도 rAF 큐도 없다. 셋 다 여기서 세운다.
 */

const W = 1422;
const H = 802;
const STAGE_TOP = 420;
const CAPTIONS = ["One.", "Two.", "Three.", "Four.", "Five."] as const;
const TYPED = "Enregistrer";

let queue: FrameRequestCallback[] = [];
let lastId = 0;
let cancelled: number[] = [];
let observers: { callback: ResizeObserverCallback; disconnected: boolean }[] = [];
let media: { matches: boolean; listeners: Set<() => void> };

beforeEach(() => {
  queue = [];
  cancelled = [];
  observers = [];
  media = { matches: false, listeners: new Set() };
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queue.push(callback);
    lastId += 1;
    return lastId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { cancelled.push(id); });
  vi.stubGlobal("ResizeObserver", class {
    entry: { callback: ResizeObserverCallback; disconnected: boolean };
    constructor(callback: ResizeObserverCallback) {
      this.entry = { callback, disconnected: false };
      observers.push(this.entry);
    }
    observe() {}
    unobserve() {}
    disconnect() { this.entry.disconnected = true; }
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() { return query.includes("reduce") && media.matches; },
    media: query,
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  }));
});

afterEach(() => { vi.unstubAllGlobals(); });

async function flush() {
  await act(async () => {
    for (let guard = 0; queue.length > 0 && guard < 10; guard += 1) {
      const batch = queue.splice(0);
      for (const callback of batch) callback(0);
    }
  });
}

/** 스크롤러의 크기·위치를 jsdom에 심는다 — 트랙 윗변은 `STAGE_TOP − scrollTop`에 있다. */
function geometry(scroller: HTMLElement, size: { w: number; h: number }) {
  Object.defineProperty(scroller, "clientWidth", { configurable: true, get: () => size.w });
  Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => size.h });
  const track = find<HTMLElement>(scroller, "section");
  track.getBoundingClientRect = () => ({ top: STAGE_TOP - scroller.scrollTop }) as DOMRect;
  scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
}

const stageUi = () => (
  <div data-testid="scroller" style={{ overflowY: "auto" }}>
    <Stage
      label="How Malmoi works"
      captions={CAPTIONS}
      typed={TYPED}
      scenes={[...CAPTIONS.map((caption) => <div key={caption}><span data-landing-typed="" /></div>)] as Parameters<typeof Stage>[0]["scenes"]}
      closing={<section aria-labelledby="cta"><h2 id="cta">Start</h2></section>}
    />
  </div>
);

async function mount(onRender?: () => void) {
  const ui = stageUi();
  const { container } = await render(onRender ? <Profiler id="stage" onRender={onRender}>{ui}</Profiler> : ui);
  const scroller = find<HTMLElement>(container, "[data-testid=scroller]");
  const size = { w: W, h: H };
  geometry(scroller, size);
  return { container, scroller, size };
}

async function scrollTo(scroller: HTMLElement, top: number) {
  scroller.scrollTop = top;
  await act(async () => { scroller.dispatchEvent(new Event("scroll")); });
  await flush();
}

/** 한 위치에서 보이는 것 전부 — 역방향 스크럽이 같은 화면을 그리는지 이것으로 견준다. */
function snapshot(container: HTMLElement) {
  const frameNode = find<HTMLElement>(container, "[data-landing-frame]");
  return {
    transform: frameNode.style.transform,
    scene: frameNode.dataset.scene,
    badge: frameNode.dataset.badge,
    layers: [...container.querySelectorAll<HTMLElement>("[data-landing-layer]")].map((node) => node.style.opacity),
    segments: [...container.querySelectorAll<HTMLElement>("[data-landing-segment]")].map((node) => node.style.transform),
    caption: find<HTMLElement>(container, "[data-landing-caption]").textContent,
    typed: [...container.querySelectorAll("[data-landing-typed]")].map((node) => node.textContent),
  };
}

const at = (scrollTop: number, reducedMotion = false, size = { W, H }) =>
  frame({ scrollTop, stageTop: STAGE_TOP, W: size.W, H: size.H, reducedMotion });

describe("Stage — 스크롤 위치가 화면을 정한다", () => {
  it("첫 rAF가 배율을 쓰고 `data-ready`를 세운다 — 그 전엔 트랙이 접혀 있고 씬 ①도 안 보인다", async () => {
    const { container } = await mount();
    const track = find<HTMLElement>(container, "section[aria-label='How Malmoi works']");
    expect(track.hasAttribute("data-ready")).toBe(false);
    // SSR 상태 — 배율이 없어 1280 캔버스가 패널을 넘치므로 씬 ①이 opacity 0이다(시안 1g).
    const layers = [...container.querySelectorAll<HTMLElement>("[data-landing-layer]")];
    expect(layers).toHaveLength(5);
    expect(layers.every((node) => node.className.includes("opacity-0") && node.style.opacity === "")).toBe(true);
    expect(track.className).toMatch(/data-\[ready\]:h-\[calc\(6\*var\(--landing-stage-h\)\)\]/);

    await flush();
    expect(track.hasAttribute("data-ready")).toBe(true);
    const f = at(0);
    expect(find<HTMLElement>(container, "[data-landing-frame]").style.transform).toBe(
      `translate3d(${f.x}px, ${f.y}px, 0px) scale(${f.scale})`,
    );
    expect(find<HTMLElement>(container, "[data-landing-root]").style.getPropertyValue("--landing-stage-h")).toBe(`${H}px`);
  });

  it("p₁ → p₂ → p₁로 되돌아오면 씬·배율·캡션·타이핑이 전부 같다", async () => {
    const { container, scroller } = await mount();
    await flush();
    const p1 = STAGE_TOP + 1.3 * H; // 씬 ② 정지 구간 — 타이핑 중
    await scrollTo(scroller, p1);
    const first = snapshot(container);
    await scrollTo(scroller, STAGE_TOP + 3.8 * H);
    expect(snapshot(container)).not.toEqual(first);
    await scrollTo(scroller, p1);
    expect(snapshot(container)).toEqual(first);
  });

  it("DOM에 쓰는 값이 `frame()`과 같다 — 씬 번호 · 배지 · 캡션 · 타이핑 접두", async () => {
    const { container, scroller } = await mount();
    await flush();
    for (const q of [0.2, 1.3, 2.5, 3.9, 4.7]) {
      const top = STAGE_TOP + q * H;
      await scrollTo(scroller, top);
      const f = at(top);
      const view = snapshot(container);
      expect(view.scene).toBe(String(f.scene.i));
      expect(view.badge).toBe(String(f.badge));
      expect(view.caption).toBe(CAPTIONS[f.caption.index]);
      expect(view.typed[0]).toBe(typedPrefix(TYPED, f.typed));
      expect(view.layers).toEqual(f.layers.map(String));
    }
  });

  it("타이핑 글자 수가 스크롤 위치의 함수다 — 씬 ② 안에서 늘고 되감으면 준다", async () => {
    const { container, scroller } = await mount();
    await flush();
    const lengths: number[] = [];
    for (const q of [1.05, 1.2, 1.4, 1.2, 1.05]) {
      await scrollTo(scroller, STAGE_TOP + q * H);
      lengths.push(snapshot(container).typed[0]?.length ?? -1);
    }
    expect(lengths[0]).toBeLessThan(lengths[2] ?? 0);
    expect(lengths.slice(0, 2)).toEqual(lengths.slice(3).reverse());
  });

  it("스크롤을 여러 번 해도 React가 다시 렌더하지 않는다 — 프레임마다 setState 0", async () => {
    let renders = 0;
    const { scroller } = await mount(() => { renders += 1; });
    await flush();
    const settled = renders;
    for (const q of [0.5, 1.5, 2.5, 3.5, 4.5]) await scrollTo(scroller, STAGE_TOP + q * H);
    expect(renders).toBe(settled);
  });
});

describe("Stage — 모션 감소", () => {
  it("`change`를 구독해 런타임 토글을 반영한다 — 배율이 트윈 없이 맞춤이 된다", async () => {
    const { container, scroller } = await mount();
    await flush();
    await scrollTo(scroller, 100);
    const transform = () => find<HTMLElement>(container, "[data-landing-frame]").style.transform;
    const moving = at(100);
    expect(transform()).toBe(`translate3d(${moving.x}px, ${moving.y}px, 0px) scale(${moving.scale})`);

    media.matches = true;
    await act(async () => { for (const listener of media.listeners) listener(); });
    await flush();
    const still = at(100, true);
    expect(still.scale).not.toBe(moving.scale);
    expect(transform()).toBe(`translate3d(${still.x}px, ${still.y}px, 0px) scale(${still.scale})`);
  });

  it("`will-change`는 트윈 구간에만 선다 — 상시로 걸면 상한 1.5에서 글자가 번진다", async () => {
    const { container, scroller } = await mount();
    await flush();
    const frameNode = find<HTMLElement>(container, "[data-landing-frame]");
    await scrollTo(scroller, 100);
    expect(frameNode.style.willChange).toBe("transform");
    await scrollTo(scroller, STAGE_TOP + 2 * H);
    expect(frameNode.style.willChange).toBe("");
  });
});

describe("Stage — 크기 변화", () => {
  it("리사이즈 콜백 뒤 배율을 다시 계산하고, 직전 q를 보존하도록 scrollTop을 옮긴다", async () => {
    const { container, scroller, size } = await mount();
    await flush();
    const top = STAGE_TOP + 2.3 * H;
    await scrollTo(scroller, top);

    size.w = 2542;
    size.h = 1342;
    await act(async () => { for (const { callback } of observers) callback([], {} as ResizeObserver); });
    await flush();

    const kept = STAGE_TOP + 2.3 * 1342;
    expect(scroller.scrollTop).toBeCloseTo(kept, 6);
    const f = at(kept, false, { W: 2542, H: 1342 });
    expect(f.scale).toBe(1.5);
    expect(find<HTMLElement>(container, "[data-landing-frame]").style.transform).toBe(
      `translate3d(${f.x}px, ${f.y}px, 0px) scale(${f.scale})`,
    );
    expect(find<HTMLElement>(container, "[data-landing-root]").style.getPropertyValue("--landing-stage-h")).toBe("1342px");
  });

  it("언마운트하면 예약된 rAF를 취소하고 리스너를 전부 푼다", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(stageUi()));
    const scroller = find<HTMLElement>(container, "[data-testid=scroller]");
    geometry(scroller, { w: W, h: H });
    await flush();
    const remove = vi.spyOn(scroller, "removeEventListener");
    scroller.scrollTop = 50;
    await act(async () => { scroller.dispatchEvent(new Event("scroll")); });
    expect(queue).toHaveLength(1);
    const pending = lastId;
    expect(media.listeners.size).toBe(1);

    await act(async () => root.unmount());
    container.remove();
    expect(cancelled).toContain(pending);
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(media.listeners.size).toBe(0);
    expect(observers.length).toBeGreaterThan(0);
    expect(observers.every((entry) => entry.disconnected)).toBe(true);
  });
});

describe("Stage — 접근성", () => {
  it("캡션 다섯은 visually-hidden `<ol>`이 늘 담고, 보이는 캡션과 프레임은 `aria-hidden`이다", async () => {
    const { container } = await mount();
    const items = [...container.querySelectorAll("ol li")].map((node) => node.textContent);
    expect(items).toEqual([...CAPTIONS]);
    expect(find(container, "ol").className).toContain("sr-only");
    expect(find(container, "[data-landing-caption]").closest("[aria-hidden='true']")).not.toBeNull();
    const frameNode = find(container, "[data-landing-frame]");
    expect(frameNode.getAttribute("aria-hidden")).toBe("true");
    expect(frameNode.hasAttribute("inert")).toBe(true);
    expect(frameNode.querySelectorAll("button, a, input, textarea, select, [tabindex]")).toHaveLength(0);
  });

  it("마무리 CTA는 스테이지 뒤에 서고 `−yPin`을 상쇄하는 자리에 들어간다", async () => {
    const { container } = await mount();
    await flush();
    const cta = find<HTMLElement>(container, "[aria-labelledby=cta]");
    expect(cta.parentElement?.className).toContain("mt-[calc(-1*var(--landing-y-pin,0px))]");
    expect(find<HTMLElement>(container, "[data-landing-root]").style.getPropertyValue("--landing-y-pin")).toBe(`${at(0).yPin}px`);
  });
});
