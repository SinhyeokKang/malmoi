// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { compile } from "tailwindcss";

import { act, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Stage } from "@/components/landing/stage";
import { BEZEL, CHROME_GAP, PLAY, SCREEN_BORDER, STATE_CANVAS_H, STATE_CANVAS_W, TOOLBAR_H, frame, trackHeight, typedPrefix, type Device } from "@/lib/landing/stage";
import { SM_QUERY, WIDE_QUERY } from "@/lib/shell/breakpoint";

import { find, render } from "./helpers/dom";

/**
 * **랜딩 스테이지의 배선** (DESIGN §6.615). 수학은 `lib/landing/stage.ts`가 들고 여기서는 그 값이 DOM에
 * 그대로 쓰이는지만 본다 — 기대값을 `frame()`에서 뽑아 식을 두 벌 두지 않는다.
 *
 * ⚠️ **스텁 없이는 분기가 안 돈다** (POSTMORTEM 2026-09-23) — `vitest.setup.ts`의 `ResizeObserver`는 콜백을
 * 한 번도 부르지 않고 jsdom에는 `matchMedia`도 rAF 큐도 없다. 셋 다 여기서 세운다.
 */

const W = 1422;
const H = 802;
const STAGE_TOP = 420;
const CAPTIONS = ["One.", "Two.", "Three.", "Four.", "Five."] as const;
/** 스텁이 돌려주는 캡션 블록 높이 — jsdom은 0이라 숫자를 심어야 `chromeHeight` 전달이 보인다. 간격 16은 스테이지가 더한다. */
const CHROME = 53;
const TYPED = "Enregistrer";

let queue: FrameRequestCallback[] = [];
let lastId = 0;
let cancelled: number[] = [];
let observers: { callback: ResizeObserverCallback; disconnected: boolean }[] = [];
let media: { matches: boolean; listeners: Set<() => void> };
/** 뷰포트 질의 결과 — **기본은 `lg` 이상(D)**이고 그릇 케이스가 바꾼다. 스테이지는 이 둘에 리스너를 달지 않는다. */
let viewport: { lg: boolean; sm: boolean };
/** 질의별로 단 리스너 — 그릇 질의에 리스너가 없다는 것을 센다. */
let subscribed: string[] = [];

beforeEach(() => {
  queue = [];
  cancelled = [];
  observers = [];
  media = { matches: false, listeners: new Set() };
  viewport = { lg: true, sm: true };
  subscribed = [];
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
    get matches() {
      if (query === WIDE_QUERY) return viewport.lg;
      if (query === SM_QUERY) return viewport.sm;
      return query.includes("reduce") && media.matches;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => { subscribed.push(query); media.listeners.add(listener); },
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

type Size = { w: number; h: number; chrome: number; stageTop: number };

/** 스크롤러의 크기·위치를 jsdom에 심는다 — 트랙 윗변은 `size.stageTop − scrollTop`에 있다(경계를 넘는 리사이즈가 옮긴다). */
function geometry(scroller: HTMLElement, size: Size) {
  Object.defineProperty(scroller, "clientWidth", { configurable: true, get: () => size.w });
  Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => size.h });
  const track = find<HTMLElement>(scroller, "section");
  track.getBoundingClientRect = () => ({ top: size.stageTop - scroller.scrollTop }) as DOMRect;
  scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  find<HTMLElement>(scroller, "[data-landing-chrome]").getBoundingClientRect = () => ({ top: 0, height: size.chrome }) as DOMRect;
}

const scene = () => <div><span data-landing-typed="" /></div>;

const stageUi = () => (
  <div data-testid="scroller" data-public-scroller="">
    <Stage
      label="How Malmoi works"
      captions={CAPTIONS}
      typed={TYPED}
      scenes={[scene(), scene(), scene(), scene(), scene()]}
      closing={<section aria-labelledby="cta"><h2 id="cta">Start</h2></section>}
    />
  </div>
);

async function mount(onRender?: () => void) {
  const ui = stageUi();
  const { container } = await render(onRender ? <Profiler id="stage" onRender={onRender}>{ui}</Profiler> : ui);
  const scroller = find<HTMLElement>(container, "[data-testid=scroller]");
  const size: Size = { w: W, h: H, chrome: CHROME, stageTop: STAGE_TOP };
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
    width: frameNode.style.width,
    scene: frameNode.dataset.scene,
    badge: frameNode.dataset.badge,
    layers: [...container.querySelectorAll<HTMLElement>("[data-landing-layer]")].map((node) => node.style.opacity),
    segments: [...container.querySelectorAll<HTMLElement>("[data-landing-segment]")].map((node) => node.style.transform),
    caption: find<HTMLElement>(container, "[data-landing-caption][data-active='1']").textContent,
    captionOpacity: find<HTMLElement>(container, "[data-landing-caption][data-active='1']").style.opacity,
    typed: [...container.querySelectorAll("[data-landing-typed]")].map((node) => node.textContent),
  };
}

const at = (scrollTop: number, reducedMotion = false, size = { W, H }, chrome = CHROME, device: Device = 0) =>
  frame({ scrollTop, stageTop: STAGE_TOP, W: size.W, H: size.H, chromeHeight: CHROME_GAP + chrome, reducedMotion, device });
/** 관찰자 콜백 — 스크롤러 크기 변화(뷰포트 리사이즈)를 흉내 낸다. */
async function resized() {
  await act(async () => { for (const { callback } of observers) callback([], {} as ResizeObserver); });
  await flush();
}
const frameOf = (container: HTMLElement) => find<HTMLElement>(container, "[data-landing-frame]");
/** 그릇 세 상태 — 뷰포트 질의 결과와 기대 크기. */
const DEVICE_CASES = [
  { name: "≥1024 D", lg: true, sm: true, device: 0 },
  { name: "640~1023 T", lg: false, sm: true, device: 1 },
  { name: "<640 M", lg: false, sm: false, device: 2 },
] as const;
/** 씬 i의 위치 f(0..1)에 해당하는 scrollTop — 씬 하나가 `PLAY.perScene`·H다. */
const sceneTop = (i: number, f: number) => STAGE_TOP + (PLAY.lead + (i + f) * PLAY.perScene) * H;

describe("Stage — 스크롤 위치가 화면을 정한다", () => {
  it("첫 rAF가 배율을 쓰고 `data-ready`를 세운다 — 그 전엔 트랙이 접혀 있고 씬 ①도 안 보인다", async () => {
    const { container } = await mount();
    const track = find<HTMLElement>(container, "section[aria-label='How Malmoi works']");
    expect(track.hasAttribute("data-ready")).toBe(false);
    // SSR 상태 — 배율이 없어 1440 캔버스가 패널을 넘치므로 씬 ①이 opacity 0이다.
    const layers = [...container.querySelectorAll<HTMLElement>("[data-landing-layer]")];
    expect(layers).toHaveLength(5);
    expect(layers.every((node) => node.className.includes("opacity-0") && node.style.opacity === "")).toBe(true);
    expect(track.className).toContain("data-[ready]:h-[var(--landing-track-h)]");

    await flush();
    expect(track.hasAttribute("data-ready")).toBe(true);
    const f = at(0);
    expect(find<HTMLElement>(container, "[data-landing-frame]").style.transform).toBe(
      `translate3d(${f.x}px, ${f.y}px, 0px) scale(${f.scale})`,
    );
    const root = find<HTMLElement>(container, "[data-landing-root]");
    // 스테이지 높이는 한 칸 위(스크롤러)에 쓴다 — 랜딩 배경 캔버스가 스테이지 밖에서 같은 값을 읽는다(landing-kv-background R3).
    expect(find<HTMLElement>(container, "[data-public-scroller]").style.getPropertyValue("--landing-stage-h")).toBe(`${H}px`);
    expect(root.style.getPropertyValue("--landing-stage-h")).toBe("");
    expect(root.style.getPropertyValue("--landing-track-h")).toBe(`${trackHeight(H)}px`);
  });

  /** 스크롤 구동 확대는 없다(2026-09-27 사용자) — 올라오는 중부터 끝까지 같은 transform이다. */
  it("재생 내내 프레임의 배율·위치·폭·높이가 바뀌지 않는다", async () => {
    const { container, scroller } = await mount();
    await flush();
    const frameNode = frameOf(container);
    const first = [frameNode.style.transform, frameNode.style.width, frameNode.style.height];
    expect(first.slice(1)).toEqual(["1440px", "900px"]);
    for (const top of [100, STAGE_TOP, sceneTop(0, 0.1), sceneTop(0, 0.8), sceneTop(2, 0.05), sceneTop(3, 0.9), sceneTop(9, 0)]) {
      await scrollTo(scroller, top);
      expect([frameNode.style.transform, frameNode.style.width, frameNode.style.height]).toEqual(first);
    }
    expect(frameNode.style.willChange).toBe("");
  });

  /** 뷰포트가 그릇을 고른다(V-01). 폭은 프레임 캔버스 폭이고 베젤 안 화면(목업 루트)은 거기서 18을 뺀 레이아웃 폭이다. */
  it.each(DEVICE_CASES)("$name — 프레임 폭·높이·transform이 그 그릇의 `frame()`이다", async ({ lg, sm, device }) => {
    viewport = { lg, sm };
    const { container, scroller } = await mount();
    await flush();
    const frameNode = frameOf(container);
    expect([frameNode.style.width, frameNode.style.height]).toEqual([`${STATE_CANVAS_W[device]}px`, `${STATE_CANVAS_H[device]}px`]);
    for (const [i, f] of [[0, 0], [1, 0.3], [1, 0.8], [4, 0.9]] as const) {
      const top = sceneTop(i, f);
      await scrollTo(scroller, top);
      const want = at(top, false, { W, H }, CHROME, device);
      expect(frameNode.style.width).toBe(`${want.canvasW}px`);
      expect(frameNode.style.height).toBe(`${want.canvasH}px`);
      expect(frameNode.style.transform).toBe(`translate3d(${want.x}px, ${want.y}px, 0px) scale(${want.scale})`);
      expect(find<HTMLElement>(container, "[data-landing-chrome-block]").style.maxWidth).toBe(`${want.chromeW}px`);
    }
  });

  /** ⚠️ 스크롤러 폭으로 판정하지 않는다 — 1030 뷰포트(스크롤바 보임)의 스크롤러는 1009쯤이어도 뷰포트 `lg`가 참이면 D다. */
  it("스크롤러 clientWidth 1009 + `lg` 참 → D", async () => {
    const { container, size } = await mount();
    size.w = 1009;
    await flush();
    expect(frameOf(container).style.width).toBe("1440px");
    expect(frameOf(container).style.transform).toBe((() => {
      const f = at(0, false, { W: 1009, H }, CHROME, 0);
      return `translate3d(${f.x}px, ${f.y}px, 0px) scale(${f.scale})`;
    })());
  });

  /** 측정 전 프레임은 `invisible`이다 — 그 사이에 그릇 크기가 서야 모바일 방문자에게 D가 비치지 않는다. */
  it("첫 틱이 `data-ready`보다 먼저 그릇 폭·높이를 쓴다", async () => {
    viewport = { lg: false, sm: false };
    const { container } = await mount();
    const track = find<HTMLElement>(container, "section[aria-label='How Malmoi works']");
    const order: string[] = [];
    const observer = new MutationObserver((list) => {
      for (const record of list) {
        if (record.target === frameOf(container) && record.attributeName === "style" && frameOf(container).style.width === "393px") order.push("width");
        if (record.target === track && record.attributeName === "data-ready") order.push("ready");
      }
    });
    observer.observe(container, { attributes: true, subtree: true, attributeOldValue: true });
    await flush();
    observer.disconnect();
    expect(order.indexOf("width")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("width")).toBeLessThan(order.indexOf("ready"));
    expect([frameOf(container).style.width, frameOf(container).style.height]).toEqual(["393px", "776px"]);
  });

  /** 그릇 질의는 리스너 없이 틱이 `.matches`를 읽는다 — 크기 변화는 `ResizeObserver`가 받는다. */
  it("그릇 질의(`lg`·`sm`)에는 change 리스너를 달지 않는다 — 모션 감소 하나뿐이다", async () => {
    await mount();
    await flush();
    expect(subscribed).toEqual(["(prefers-reduced-motion: reduce)"]);
  });

  /** 같은 그릇 안에서 캡션 자리는 재생 내내 불변이다(V-05d). */
  it("재생 내내 캡션 블록 transform은 그대로다", async () => {
    const { container, scroller } = await mount();
    await flush();
    const chrome = find<HTMLElement>(container, "[data-landing-chrome]");
    const first = chrome.style.transform;
    for (const f of [0.23, 0.37, 0.51, 0.65, 0.935]) {
      await scrollTo(scroller, sceneTop(1, f));
      expect(chrome.style.transform).toBe(first);
    }
  });

  /** 재생 중 그릇이 바뀌지 않으므로 레이어를 배치에서 빼지 않는다 — 다섯 레이어가 놓인 채 transform·opacity만 쓴다. */
  it("레이어에 `data-idle`·`content-visibility`가 없다", async () => {
    const { container, scroller } = await mount();
    await flush();
    const layers = [...container.querySelectorAll<HTMLElement>("[data-landing-layer]")];
    for (const top of [0, sceneTop(0, 0.8), sceneTop(2, 0.3), sceneTop(4, 0.5)]) {
      await scrollTo(scroller, top);
      for (const node of layers) {
        expect(node.hasAttribute("data-idle")).toBe(false);
        expect(node.className).not.toContain("content-visibility");
      }
    }
  });

  /** 같은 값의 속성 쓰기도 스타일을 무효화한다 — 스크롤 틱은 프레임 style을 다시 쓰지 않는다(그릇·배율이 크기의 함수). */
  it("스크롤 틱은 프레임 style을 쓰지 않는다 — 씬이 바뀌어도", async () => {
    const { container, scroller } = await mount();
    await flush();
    await scrollTo(scroller, sceneTop(1, 0.3));
    let records = 0;
    const observer = new MutationObserver((list) => { records += list.length; });
    observer.observe(frameOf(container), { attributes: true, attributeFilter: ["style"] });
    for (const top of [sceneTop(1, 0.31), sceneTop(1, 0.5), sceneTop(1, 0.8), sceneTop(2, 0.3), sceneTop(0, 0.1)]) await scrollTo(scroller, top);
    expect(records).toBe(0);
    observer.disconnect();
  });

  it("p₁ → p₂ → p₁로 되돌아오면 씬·배율·캡션·타이핑이 전부 같다", async () => {
    const { container, scroller } = await mount();
    await flush();
    const p1 = sceneTop(1, 0.3); // 씬 ② 정지 — 타이핑 중
    await scrollTo(scroller, p1);
    const first = snapshot(container);
    await scrollTo(scroller, sceneTop(3, 0.8));
    expect(snapshot(container)).not.toEqual(first);
    await scrollTo(scroller, p1);
    expect(snapshot(container)).toEqual(first);
  });

  it("DOM에 쓰는 값이 `frame()`과 같다 — 씬 번호 · 배지 · 캡션 · 타이핑 접두", async () => {
    const { container, scroller } = await mount();
    await flush();
    for (const [i, pos] of [[0, 0.2], [1, 0.3], [2, 0.5], [3, 0.9], [4, 0.7]] as const) {
      const top = sceneTop(i, pos);
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
    for (const f of [0.05, 0.2, 0.4, 0.2, 0.05]) {
      await scrollTo(scroller, sceneTop(1, f));
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
    for (const [i, f] of [[0, 0.5], [1, 0.23], [2, 0.8], [3, 0.9], [4, 0.5]] as const) await scrollTo(scroller, sceneTop(i, f));
    expect(renders).toBe(settled);
  });
});

describe("Stage — 모션 감소", () => {
  it("`change`를 구독해 런타임 토글을 반영한다 — 전환 한가운데의 교차가 단절로 바뀐다", async () => {
    const { container, scroller } = await mount();
    await flush();
    const top = sceneTop(0, 0.78); // 교차 앞 절반
    await scrollTo(scroller, top);
    const layers = () => snapshot(container).layers;
    expect(layers()).toEqual(at(top).layers.map(String));
    expect(at(top).layers[0]).toBeLessThan(1);

    media.matches = true;
    await act(async () => { for (const listener of media.listeners) listener(); });
    await flush();
    expect(layers()).toEqual(at(top, true).layers.map(String));
    expect(at(top, true).layers).toEqual([1, 0, 0, 0, 0]);
  });

  it("모션 감소에서도 그릇은 뷰포트의 것 하나다 — 재생 중 폭이 바뀌지 않는다", async () => {
    media.matches = true; // 마운트 effect가 읽는다
    viewport = { lg: false, sm: true };
    const { container, scroller } = await mount();
    await flush();
    const seen = new Set<string>();
    for (let f = 0; f < 5; f += 0.1) {
      await scrollTo(scroller, STAGE_TOP + f * PLAY.perScene * H);
      seen.add(frameOf(container).style.width);
    }
    expect([...seen]).toEqual(["786px"]);
  });
});

describe("Stage — 크기 변화", () => {
  it("리사이즈 콜백 뒤 배율을 다시 계산하고, 직전 q를 보존하도록 scrollTop을 옮긴다", async () => {
    const { container, scroller, size } = await mount();
    await flush();
    const top = STAGE_TOP + 2.3 * H;
    await scrollTo(scroller, top);
    const widthBefore = find<HTMLElement>(container, "[data-landing-frame]").style.width;

    size.w = 2542;
    size.h = 1342;
    await resized();

    const kept = STAGE_TOP + 2.3 * 1342;
    expect(scroller.scrollTop).toBeCloseTo(kept, 6);
    const f = at(kept, false, { W: 2542, H: 1342 });
    // device가 그대로면 그릇도 그대로다 — H만 바뀐 리사이즈.
    expect(find<HTMLElement>(container, "[data-landing-frame]").style.width).toBe(widthBefore);
    expect(widthBefore).toBe(`${f.canvasW}px`);
    expect(f.scale).toBe(1);
    expect(find<HTMLElement>(container, "[data-landing-frame]").style.transform).toBe(
      `translate3d(${f.x}px, ${f.y}px, 0px) scale(${f.scale})`,
    );
    expect(scroller.style.getPropertyValue("--landing-stage-h")).toBe("1342px");
    expect(find<HTMLElement>(container, "[data-landing-root]").style.getPropertyValue("--landing-track-h")).toBe(`${trackHeight(1342)}px`);
  });

  /**
   * ⚠️ **드래그 리사이즈에서는 rAF가 관찰자 콜백보다 먼저 새 H를 본다** (L-stage 리뷰 r1). 관찰자는 레이아웃 뒤, rAF는
   * 레이아웃 전에 돌아서 틱이 새 H를 먼저 읽고 `lastH`를 덮으면 콜백이 "바뀐 것 없음"으로 건너뛴다 — 702 → 902 드래그가
   * q 2.3을 1.8(씬 ②)로 되감았다. 보존은 틱 안에서 한다.
   */
  it("크기가 연달아 바뀌어도(틱이 콜백보다 먼저 새 H를 읽어도) 직전 q를 보존한다", async () => {
    const { scroller, size } = await mount();
    await flush();
    await scrollTo(scroller, STAGE_TOP + 2.3 * H);

    size.h = 902;
    await act(async () => { for (const { callback } of observers) callback([], {} as ResizeObserver); });
    size.h = 1002; // 드래그가 이어져 다음 rAF 전에 한 번 더 바뀐다
    await flush();
    await act(async () => { for (const { callback } of observers) callback([], {} as ResizeObserver); });
    await flush();
    expect((scroller.scrollTop - STAGE_TOP) / 1002).toBeCloseTo(2.3, 6);

    size.h = 1102; // 콜백 없이 스크롤 틱이 먼저 새 H를 읽는다
    await act(async () => { scroller.dispatchEvent(new Event("scroll")); });
    await flush();
    await act(async () => { for (const { callback } of observers) callback([], {} as ResizeObserver); });
    await flush();
    expect((scroller.scrollTop - STAGE_TOP) / 1102).toBeCloseTo(2.3, 6);
  });

  it("언마운트하면 예약된 rAF를 취소하고 리스너를 전부 푼다", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(stageUi()));
    const scroller = find<HTMLElement>(container, "[data-testid=scroller]");
    geometry(scroller, { w: W, h: H, chrome: CHROME, stageTop: STAGE_TOP });
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


/**
 * **뷰포트 경계를 넘는 리사이즈** (V-03) — 그릇은 즉시 바뀌고(애니메이션 없음), 재생 위치(씬 번호 `i`·씬 안 진행 `f`)는 그대로다.
 * 경계를 넘으면 H가 그대로여도 트랙 여백(`mt-16 lg:mt-30`)·히어로 h1이 바뀌어 `stageTop`이 움직인다 — 그 경우도 보존한다.
 */
describe("Stage — 뷰포트 그릇 전환", () => {
  /** 화면에서 재생 위치를 말하는 값만 — 그릇·배율과 무관한 것. */
  const progress = (container: HTMLElement) => {
    const { scene, layers, segments, caption, captionOpacity, typed, badge } = snapshot(container);
    return { scene, layers, segments, caption, captionOpacity, typed, badge };
  };

  it("H 고정 · `stageTop`만 이동 · `lg` 경계 넘김(1024 → 1023) — 씬·씬 안 진행이 같고 그릇은 T로", async () => {
    const { container, scroller, size } = await mount();
    await flush();
    const top = sceneTop(1, 0.75); // 씬 ② 전환 중
    await scrollTo(scroller, top);
    const before = progress(container);
    const u = (scroller.scrollTop - STAGE_TOP) / H;

    viewport = { lg: false, sm: true };
    size.w = 1005;
    size.stageTop = STAGE_TOP - 74; // 트랙 위 여백 120 → 64 + 히어로 h1 48 → 30 (값 자체는 임의 — 움직였다는 것이 요점)
    await resized();

    expect((scroller.scrollTop - size.stageTop) / H).toBeCloseTo(u, 9);
    expect(progress(container)).toEqual(before);
    expect([frameOf(container).style.width, frameOf(container).style.height]).toEqual(["786px", "900px"]);

    // 되돌아가도(1023 → 1024) 같다.
    viewport = { lg: true, sm: true };
    size.w = W;
    size.stageTop = STAGE_TOP;
    await resized();
    expect((scroller.scrollTop - STAGE_TOP) / H).toBeCloseTo(u, 9);
    expect(progress(container)).toEqual(before);
    expect(frameOf(container).style.width).toBe("1440px");
  });

  /**
   * **보존은 직전에 칠한 scrollTop 기준이다** (리뷰 R1) — 브라우저 스크롤 앵커링(Chrome·Firefox)은 트랙 위 형제(히어로)의 높이가 Δ 바뀌면
   * 틱 전에 `scrollTop`을 같은 Δ만큼 먼저 옮긴다. 현재 scrollTop으로 u를 다시 재면 그 Δ를 한 번 더 더해 q가 Δ/H만큼 반대로 튄다.
   * 셋 다 `(scrollTop − stageTop)/H`가 직전 u와 같아야 한다 — 앵커링이 있든(②) 없든(①③).
   */
  describe("재생 위치 보존 — 스크롤 앵커링과 무관하다", () => {
    const keep = async (move: (size: Size, scroller: HTMLElement) => void) => {
      const { container, scroller, size } = await mount();
      await flush();
      await scrollTo(scroller, sceneTop(2, 0.45));
      const before = progress(container);
      const u = (scroller.scrollTop - size.stageTop) / H;
      move(size, scroller);
      await resized();
      expect((scroller.scrollTop - size.stageTop) / size.h).toBeCloseTo(u, 9);
      expect(progress(container)).toEqual(before);
      return { container, size };
    };

    it("① stageTop만 이동(H 고정 · 앵커링 없음 — Safari)", async () => {
      await keep((size) => { size.stageTop = STAGE_TOP - 74; });
    });

    it("② 앵커링 흉내 — stageTop이 Δ 움직일 때 scrollTop도 같은 Δ만큼 먼저 옮겨진 뒤 틱", async () => {
      await keep((size, scroller) => {
        const delta = -74;
        size.stageTop = STAGE_TOP + delta;
        scroller.scrollTop += delta;
      });
    });

    it("③ 경계 안 폭 리사이즈(device 그대로 — 1280 → 1100, 히어로가 다시 감겨 stageTop만 이동)", async () => {
      const { container } = await keep((size, scroller) => {
        size.w = 1082;
        size.stageTop = STAGE_TOP + 31;
        scroller.scrollTop += 31; // 앵커링이 먼저 옮긴다
      });
      expect(frameOf(container).style.width).toBe("1440px");
    });
  });

  it("폭·높이가 함께 바뀌어도(기기 회전 — M ↔ T) 씬·씬 안 진행이 같다", async () => {
    viewport = { lg: false, sm: false };
    const { container, scroller, size } = await mount();
    size.w = 357;
    size.h = 714;
    await flush();
    await scrollTo(scroller, STAGE_TOP + 2.45 * 714);
    const before = progress(container);
    expect(frameOf(container).style.width).toBe("393px");

    viewport = { lg: false, sm: true };
    size.w = 794;
    size.h = 330;
    size.stageTop = STAGE_TOP + 12;
    await resized();
    expect((scroller.scrollTop - size.stageTop) / 330).toBeCloseTo(2.45, 9);
    expect(progress(container)).toEqual(before);
    expect(frameOf(container).style.width).toBe("786px");
  });

  /** 경계를 넘는 순간 한 틱에 바뀐다 — 보간·애니메이션이 없다. */
  it("고정 구간 한가운데 device 변경 → 다음 틱에 폭·높이·배율이 그 그릇의 것이다", async () => {
    const { container, scroller } = await mount();
    await flush();
    await scrollTo(scroller, sceneTop(2, 0.5));
    viewport = { lg: false, sm: false };
    await resized();
    const want = at(scroller.scrollTop, false, { W, H }, CHROME, 2);
    expect([frameOf(container).style.width, frameOf(container).style.height]).toEqual(["393px", "776px"]);
    expect(frameOf(container).style.transform).toBe(`translate3d(${want.x}px, ${want.y}px, 0px) scale(${want.scale})`);
    expect(find<HTMLElement>(container, "[data-landing-chrome]").style.transform).toBe(`translate3d(0px, ${want.chromeY}px, 0px)`);
  });

  it("H만 바뀌고 device가 그대로면 그릇도 그대로다", async () => {
    viewport = { lg: false, sm: true };
    const { container, scroller, size } = await mount();
    await flush();
    await scrollTo(scroller, sceneTop(3, 0.2));
    size.h = 702;
    await resized();
    expect(frameOf(container).style.width).toBe("786px");
    expect((scroller.scrollTop - STAGE_TOP) / 702).toBeCloseTo(3.2, 9);
  });

  it("모션 감소 토글과 device 변경이 한 틱에 같이 와도 둘 다 반영된다", async () => {
    const { container, scroller } = await mount();
    await flush();
    const top = sceneTop(0, 0.78);
    await scrollTo(scroller, top);
    media.matches = true;
    viewport = { lg: false, sm: false };
    await act(async () => {
      for (const listener of media.listeners) listener();
      for (const { callback } of observers) callback([], {} as ResizeObserver);
    });
    await flush();
    const want = at(top, true, { W, H }, CHROME, 2);
    expect(snapshot(container).layers).toEqual(want.layers.map(String));
    expect(want.layers).toEqual([1, 0, 0, 0, 0]);
    expect(frameOf(container).style.width).toBe("393px");
  });

  it("정적 ↔ 고정 왕복 중 device가 바뀌면 정적 장 크기 변수도 바뀐다", async () => {
    const { container, size } = await mount();
    const root = find<HTMLElement>(container, "[data-landing-root]");
    size.chrome = 600;
    await flush();
    expect(root.style.getPropertyValue("--landing-canvas-w")).toBe("1440px");

    viewport = { lg: false, sm: false };
    size.w = 357;
    await resized();
    expect(container.querySelector("[data-landing-static]")).not.toBeNull();
    expect(root.style.getPropertyValue("--landing-canvas-w")).toBe("393px");
    expect(root.style.getPropertyValue("--landing-canvas-h")).toBe("776px");
    // 정적 배율 = 캡션 최대 폭 / 그릇 폭(폭만으로 정한 배율).
    expect(Number(root.style.getPropertyValue("--landing-static-scale"))).toBeCloseTo(at(0, false, { W: 357, H }, 600, 2).chromeW / 393, 10);

    size.chrome = CHROME;
    await resized();
    expect(container.querySelector("[data-landing-static]")).toBeNull();
    expect(frameOf(container).style.width).toBe("393px");

    viewport = { lg: false, sm: true };
    size.w = 750;
    size.chrome = 600;
    await resized();
    expect(root.style.getPropertyValue("--landing-canvas-w")).toBe("786px");
    expect(root.style.getPropertyValue("--landing-canvas-h")).toBe("900px");
  });
});

/**
 * **캡션 높이는 잰 값이 `fitScale`에 들어간다** (design §4). jsdom은 레이아웃이 없어 높이가 0이므로 여기서는 스텁이 넘긴 값이
 * 그대로 `frame()`의 `chromeHeight`(간격 16 포함)로 전달됐는지만 본다 — 줄바꿈·겹침 0은 실물(b)이 잰다.
 */
describe("Stage — 캡션 높이 측정", () => {
  const transformOf = (container: HTMLElement) => find<HTMLElement>(container, "[data-landing-frame]").style.transform;
  const expected = (f: ReturnType<typeof at>) => `translate3d(${f.x}px, ${f.y}px, 0px) scale(${f.scale})`;

  it("잰 높이에 간격 16을 더해 넘긴다 — 캡션 블록 윗변도 같은 값에서 나온다", async () => {
    const { container } = await mount();
    await flush();
    const f = at(0);
    expect(transformOf(container)).toBe(expected(f));
    expect(find<HTMLElement>(container, "[data-landing-chrome]").style.transform).toBe(`translate3d(0px, ${f.chromeY}px, 0px)`);
  });

  it("다른 높이를 재면 배치가 달라진다 — 고정 28이 아니라 입력이다", async () => {
    // 세로가 배율을 정하는 크기에서 본다 — 폭이 정하면 높이가 배율을 안 바꾼다.
    const { container, size } = await mount();
    size.h = 420;
    await flush();
    const one = transformOf(container);
    size.chrome = 3 + 8 + 21 * 4;
    await act(async () => { for (const { callback } of observers) callback([], {} as ResizeObserver); });
    await flush();
    const four = transformOf(container);
    expect(four).not.toBe(one);
    expect(four).toBe(expected(at(0, false, { W, H: 420 }, size.chrome)));
  });

  it("스크롤러와 캡션 블록 둘을 관찰한다 — 폰트·언어·폭으로 줄 수가 바뀌어도 같은 관측이 받는다", async () => {
    const observed: Element[] = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(_: ResizeObserverCallback) {}
      observe(node: Element) { observed.push(node); }
      unobserve() {}
      disconnect() {}
    });
    const { container } = await mount();
    expect(observed).toContain(find(container, "[data-testid=scroller]"));
    expect(observed).toContain(find(container, "[data-landing-chrome]"));
  });

  it.each(DEVICE_CASES)("$name — 캡션 블록의 최대 폭은 그 그릇의 폭만 배율 폭이다 — 측정 전에 쓰여 첫 틱이 감긴 높이를 잰다", async ({ lg, sm, device }) => {
    viewport = { lg, sm };
    const { container } = await mount();
    await flush();
    const want = at(0, false, { W, H }, CHROME, device).chromeW;
    expect(want).toBeLessThanOrEqual(STATE_CANVAS_W[device]);
    expect(find<HTMLElement>(container, "[data-landing-chrome-block]").style.maxWidth).toBe(`${want}px`);
  });
});

describe("Stage — 캡션은 같은 칸에 겹친다", () => {
  it("다섯 문장이 한 grid 칸에 겹치고 활성만 보인다 — 칸 높이는 가장 긴 문장이 정한다", async () => {
    const { container, scroller } = await mount();
    await flush();
    const items = [...container.querySelectorAll<HTMLElement>("[data-landing-caption]")];
    expect(items.map((node) => node.textContent)).toEqual([...CAPTIONS]);
    const cell = items[0]?.parentElement;
    expect(cell?.className.split(" ")).toContain("grid");
    for (const node of items) {
      expect(node.parentElement).toBe(cell);
      expect(node.className.split(" ")).toEqual(expect.arrayContaining(["col-start-1", "row-start-1"]));
      expect(node.className).not.toContain("whitespace-nowrap");
    }
    const active = () => items.filter((node) => node.dataset.active === "1").map((node) => node.textContent);
    expect(active()).toEqual(["One."]);
    expect(items.map((node) => node.style.opacity)).toEqual(["1", "0", "0", "0", "0"]);

    await scrollTo(scroller, sceneTop(1, 0.3));
    expect(active()).toEqual(["Two."]);
    expect(items.map((node) => node.style.opacity)).toEqual(["0", "1", "0", "0", "0"]);
  });

  /** 번호가 그대로인 틱은 비활성 캡션에 쓰지 않는다 — `dataset` 쓰기는 같은 값이어도 속성 변경이라 스타일 무효화를 부른다. */
  it("같은 캡션 번호의 틱은 비활성 캡션 DOM에 쓰지 않고, 번호가 바뀌면 한 번 쓴다", async () => {
    const { container, scroller } = await mount();
    await flush();
    const items = [...container.querySelectorAll<HTMLElement>("[data-landing-caption]")];
    const inactive = items.slice(1);
    // 콜백이 기록을 비우므로 센다 — `takeRecords`만으로는 microtask 전달 뒤라 0이 된다.
    let records = 0;
    const observer = new MutationObserver((list) => { records += list.length; });
    for (const node of inactive) observer.observe(node, { attributes: true });
    for (const f of [0.1, 0.3, 0.5, 0.2]) await scrollTo(scroller, sceneTop(0, f));
    expect(records).toBe(0);
    // 활성 캡션의 opacity는 매 틱이다 — 교차 구간에서 줄어든다.
    await scrollTo(scroller, sceneTop(0, 0.78));
    expect(Number(items[0]?.style.opacity)).toBeLessThan(1);

    await scrollTo(scroller, sceneTop(1, 0.3));
    expect(records).toBeGreaterThan(0);
    expect(items.map((node) => node.dataset.active)).toEqual(["0", "1", "0", "0", "0"]);
    observer.disconnect();
  });

  it("진행 다섯 칸과 캡션이 한 flex-wrap 안에 있다 — 가로 16 · 세로 8", async () => {
    const { container } = await mount();
    const block = find<HTMLElement>(container, "[data-landing-chrome-block]");
    expect(block.className.split(" ")).toEqual(expect.arrayContaining(["flex", "flex-wrap", "justify-center", "gap-x-4", "gap-y-2"]));
    expect(block.querySelectorAll("[data-landing-segment]")).toHaveLength(5);
    expect(block.querySelector("[data-landing-caption]")).not.toBeNull();
  });

  /**
   * #216 — 한 줄이면 블록이 캡션 줄(15/1.4 = 21)만큼만 서서 R5 이전 `h-7`(28)보다 낮았고, `lg` 이상 목업 y가 3.5 내려갔다. 블록 최소 28 · 세로 가운데로
   * 한 줄 높이를 지킨다. 두 줄 이상(3 + 8 + 21 × n ≥ 53)은 최소를 넘어 자연 높이 그대로다(375 계약 69 = 16 + 53).
   */
  it("블록은 최소 28이고 세로 가운데다 — 한 줄일 때 R5 이전 `h-7`과 같은 높이 (#216)", async () => {
    const { container } = await mount();
    const block = find<HTMLElement>(container, "[data-landing-chrome-block]");
    expect(block.className.split(" ")).toEqual(expect.arrayContaining(["min-h-7", "items-center"]));
  });

  it("측정 전엔 정상 흐름이고(`relative`) 준비 뒤에 겹쳐 선다(`absolute`)", async () => {
    const { container } = await mount();
    const chrome = find<HTMLElement>(container, "[data-landing-chrome]");
    expect(chrome.className.split(" ")).toContain("relative");
    expect(chrome.className).toContain("group-data-[ready]/track:absolute");
  });
});

/**
 * **세로가 목업 최소 표시조차 못 담으면 고정 재생을 접고 같은 5씬을 정적으로 보인다** (design §4). 판정은 `frame().pinnable`이다.
 */
describe("Stage — 높이 부족 정적 흐름", () => {
  const trackOf = (container: HTMLElement) => find<HTMLElement>(container, "section[aria-label='How Malmoi works']");

  it("높이가 충분하면 정적 흐름이 없다", async () => {
    const { container } = await mount();
    await flush();
    expect(container.querySelector("[data-landing-static]")).toBeNull();
    expect(trackOf(container).hasAttribute("data-static")).toBe(false);
  });

  it("높이 부족이면 5씬·5캡션이 정적으로 서고 고정 재생은 접힌다 — 돌아오면 되돌아온다", async () => {
    const { container, scroller, size } = await mount();
    size.chrome = 600; // (802 − 32 − 616) / 900 < 0.2
    await flush();
    expect(at(0, false, { W, H }, 600).pinnable).toBe(false);
    const track = trackOf(container);
    expect(track.hasAttribute("data-static")).toBe(true);
    expect(track.hasAttribute("data-ready")).toBe(false);
    const figures = [...container.querySelectorAll<HTMLElement>("[data-landing-static] figure")];
    expect(figures).toHaveLength(5);
    expect(figures.map((node) => node.querySelector("figcaption")?.textContent)).toEqual([...CAPTIONS]);
    expect(figures.every((node) => node.getAttribute("aria-hidden") === "true" && node.querySelector("[inert]") !== null)).toBe(true);
    // 정적 배율은 폭이 정한다 — CSS 변수 하나로 다섯 장이 같이 줄어든다.
    const root = find<HTMLElement>(container, "[data-landing-root]");
    expect(Number(root.style.getPropertyValue("--landing-static-scale"))).toBeCloseTo(at(0).chromeW / 1440, 10);
    // 씬 ②의 타이핑은 다 쳐진 채, 씬 ③의 배지는 오른 채다.
    expect(figures[0]?.querySelector("[data-landing-typed]")?.textContent).toBe("");
    expect(figures[1]?.querySelector("[data-landing-typed]")?.textContent).toBe(TYPED);
    expect(figures.map((node) => node.querySelector<HTMLElement>("[data-badge]")?.dataset.badge)).toEqual(["0", "0", "1", "1", "1"]);
    // 정적 흐름의 장도 뷰포트의 그릇이다 — 크기는 루트 변수(기본 D).
    expect(root.style.getPropertyValue("--landing-canvas-w")).toBe("1440px");
    expect(root.style.getPropertyValue("--landing-canvas-h")).toBe("900px");
    expect(figures.map((node) => node.querySelector<HTMLElement>("[data-badge]")?.style.width)).toEqual(Array(5).fill("var(--landing-canvas-w, 1440px)"));

    size.chrome = CHROME;
    await resized();
    expect(container.querySelector("[data-landing-static]")).toBeNull();
    expect(track.hasAttribute("data-ready")).toBe(true);
    expect(track.hasAttribute("data-static")).toBe(false);
    await scrollTo(scroller, sceneTop(1, 0.3));
    expect(snapshot(container).scene).toBe("1");
  });

  it("정적 흐름은 좌우 패딩이 없다 — 장 폭이 이미 side 여백을 품는다", async () => {
    const { container, size } = await mount();
    size.chrome = 600;
    await flush();
    expect(find(container, "[data-landing-static]").className).not.toMatch(/(^|\s)px-/);
  });

  it("정적이어도 낭독용 `<ol>`과 마무리 CTA는 그대로다", async () => {
    const { container, size } = await mount();
    size.chrome = 600;
    await flush();
    expect(find(container, "ol").className).toContain("sr-only");
    expect([...container.querySelectorAll("ol li")].map((node) => node.textContent)).toEqual([...CAPTIONS]);
    expect(trackOf(container).nextElementSibling?.getAttribute("aria-labelledby")).toBe("cta");
  });
});

/**
 * **베젤은 흰 두꺼운 테두리 + 얇은 회색 외곽선이다** (2026-09-27 사용자 — 시안). `bg-canvas`면 회색 판 위에 화면이 얹힌
 * 모양이 되어 "기기 테두리"로 읽히지 않는다. 좌우·아래 두께는 8이고, 바깥24/안쪽16으로 하단 곡선의 중심을 맞춘다.
 */
describe("Stage — 베젤", () => {
  it("툴바와 베젤이 흰 채움과 얇은 회색 외곽선이다", async () => {
    const { container } = await mount();
    const bezel = find<HTMLElement>(container, "[data-landing-frame] > .rounded-3xl.border");
    const classes = bezel.className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["inset-0", "border", "border-border", "bg-background"]));
    expect(classes).not.toContain("bg-canvas");
  });

  it("안쪽 화면은 radius 16 토큰으로 바깥 24와 베젤 8의 곡선을 맞춘다", async () => {
    const { container } = await mount();
    const screen = find<HTMLElement>(container, "[data-landing-screen]");
    expect(screen.className.split(" ")).toContain("rounded-xl");
    expect(screen.style.left).toBe("8px");
    expect(screen.style.bottom).toBe("8px");
  });

  /**
   * ⚠️ **목업 루트 = 캔버스 − 베젤 8×2 − 화면 border 1×2**(2026-10-11 D7) — `SCREEN_BORDER`는 이 화면의 `border` 클래스(1px)를 숫자로 옮긴 것이다.
   * 두께가 바뀌면 T·M 루트가 spec 고정 768 · 375에서 어긋나므로 클래스와 상수를 함께 묶는다.
   */
  it("화면 테두리는 `border`(1px) 하나이고 상수 `SCREEN_BORDER`와 같다 — 루트 T 768 · M 375", async () => {
    const { container } = await mount();
    const screen = find<HTMLElement>(container, "[data-landing-screen]");
    const classes = screen.className.split(" ");
    expect(classes).toContain("border");
    expect(classes.filter((cls) => /^border(-[xytrbl])?(-\d+|-\[)/.test(cls))).toEqual([]);
    expect(SCREEN_BORDER).toBe(1);
    expect(screen.style.left).toBe(`${BEZEL}px`);
    expect(screen.style.right).toBe(`${BEZEL}px`);
    expect(STATE_CANVAS_W.slice(1).map((w) => w - 2 * BEZEL - 2 * SCREEN_BORDER)).toEqual([768, 375]);
  });

  /** 확대 트윈을 걷으며 베젤이 사라지지 않게 한다(2026-09-27 사용자 — 베젤은 대기 모양 그대로 상시다). */
  it("베젤과 그림자가 스크롤로 옅어지지 않는다 — opacity를 쓰지 않는다", async () => {
    const { container, scroller } = await mount();
    await flush();
    await scrollTo(scroller, STAGE_TOP + 2 * H);
    const layers = [...container.querySelectorAll<HTMLElement>("[data-landing-frame] > .rounded-3xl")];
    expect(layers).toHaveLength(1);
    expect(layers.some((node) => node.className.includes("shadow-medium"))).toBe(true);
    for (const node of layers) {
      expect(node.style.opacity).toBe("");
      expect(node.className).not.toContain("opacity-0");
    }
  });
});

/** CSS 실행은 jsdom 밖이므로 실제 컴파일 결과와 같은 Bezel의 DOM 배선을 함께 고정한다. */
describe("Stage — 모바일 툴바 제거", () => {
  function bezelContract(parent: HTMLElement) {
    const screen = find<HTMLElement>(parent, "[data-landing-screen]");
    expect(screen.style.top).toBe(""); // 인라인 top이 반응형 클래스를 덮지 않는다.
    expect([...screen.classList]).toEqual(expect.arrayContaining(["top-[8px]", "sm:top-[44px]"]));
    expect([screen.style.right, screen.style.bottom, screen.style.left]).toEqual(["8px", "8px", "8px"]);
    const toolbar = find<HTMLElement>(parent, "[data-landing-toolbar]");
    expect([...toolbar.classList]).toEqual(expect.arrayContaining(["hidden", "sm:flex"]));
    expect(toolbar.classList.contains("flex")).toBe(false);
    expect(toolbar.style.height).toBe(`${TOOLBAR_H}px`);
    expect(toolbar.children).toHaveLength(3);
    expect(screen.contains(toolbar)).toBe(false);
  }

  it("sm CSS는 640부터 툴바·44px 상단을 복원하고 그 아래는 8px다", async () => {
    const { container } = await mount();
    bezelContract(frameOf(container));
    const require = createRequire(join(process.cwd(), "package.json"));
    const globals = join(process.cwd(), "app/globals.css");
    const compiler = await compile(readFileSync(globals, "utf8"), {
      base: dirname(globals),
      loadStylesheet: async (id, base) => {
        const path = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id, { paths: [base] });
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      },
    });
    const css = compiler.build(["top-[8px]", "sm:top-[44px]", "hidden", "sm:flex"]);
    expect(css).toContain("top: 8px;");
    expect(css).toMatch(/\.hidden\s*\{\s*display: none;/);
    expect(css).toMatch(/@media \(width >= 40rem\)\s*\{\s*\.sm\\:top-\\\[44px\\\]\s*\{\s*top: 44px;\s*\}\s*\.sm\\:flex\s*\{\s*display: flex;\s*\}\s*\}/);
    expect(BEZEL).toBe(8);
    expect(TOOLBAR_H).toBe(44);
    expect(SM_QUERY).toBe("(min-width: 40rem)");
  });

  it.each([false, true])("모션 감소 %s — 다섯 씬에서 639↔640·1023↔1024 왕복이 DOM·진행을 보존한다", async reduced => {
    media.matches = reduced;
    let renders = 0;
    const { container, scroller, size } = await mount(() => { renders += 1; });
    await flush();
    const node = frameOf(container);
    const layers = [...node.querySelectorAll("[data-landing-layer]")];
    const settled = renders;
    for (let scene = 0; scene < 5; scene += 1) {
      await scrollTo(scroller, sceneTop(scene, 0.35));
      const { transform: _transform, width: _width, ...before } = snapshot(container);
      for (const width of [639, 640, 639, 640, 1023, 1024, 1023, 1024]) {
        viewport = { lg: width >= 1024, sm: width >= 640 };
        size.w = width - 18;
        await resized();
        const { transform: _nextTransform, width: _nextWidth, ...after } = snapshot(container);
        expect(after).toEqual(before);
        const device = width < 640 ? 2 : width < 1024 ? 1 : 0;
        expect([node.style.width, node.style.height]).toEqual([`${STATE_CANVAS_W[device]}px`, `${STATE_CANVAS_H[device]}px`]);
        expect(frameOf(container)).toBe(node);
        expect([...node.querySelectorAll("[data-landing-layer]")]).toEqual(layers);
        bezelContract(node);
      }
    }
    expect(renders).toBe(settled);
    expect(container.querySelectorAll("[data-landing-segment]")).toHaveLength(5);
  });

  it.each(DEVICE_CASES)("$name — 정적 다섯 장과 고정 재생에 같은 반응형 베젤이 선다", async ({ lg, sm, device }) => {
    viewport = { lg, sm };
    const { container, size } = await mount();
    size.chrome = 700;
    await flush();
    const figures = [...container.querySelectorAll<HTMLElement>("[data-landing-static] figure")];
    expect(figures).toHaveLength(5);
    figures.forEach(bezelContract);
    const root = find<HTMLElement>(container, "[data-landing-root]");
    expect(root.style.getPropertyValue("--landing-canvas-w")).toBe(`${STATE_CANVAS_W[device]}px`);
    expect(root.style.getPropertyValue("--landing-canvas-h")).toBe(`${STATE_CANVAS_H[device]}px`);
    size.chrome = CHROME;
    await resized();
    expect(container.querySelector("[data-landing-static]")).toBeNull();
    bezelContract(frameOf(container));
  });
});

describe("Stage — 접근성", () => {
  it("캡션 다섯은 visually-hidden `<ol>`이 늘 담고, 보이는 캡션과 프레임은 `aria-hidden`이다", async () => {
    const { container } = await mount();
    const items = [...container.querySelectorAll("ol li")].map((node) => node.textContent);
    expect(items).toEqual([...CAPTIONS]);
    expect(find(container, "ol").className).toContain("sr-only");
    for (const node of container.querySelectorAll("[data-landing-caption]")) expect(node.closest("[aria-hidden='true']")).not.toBeNull();
    const frameNode = find(container, "[data-landing-frame]");
    expect(frameNode.getAttribute("aria-hidden")).toBe("true");
    expect(frameNode.hasAttribute("inert")).toBe(true);
    expect(frameNode.querySelectorAll("button, a, input, textarea, select, [tabindex]")).toHaveLength(0);
  });

  /**
   * ⚠️ **sticky 층은 투명하지만 positioned라** 겹친 형제 위에서 클릭을 먹는다 — 옛 구조에서 끌어올린 CTA의 `Get started`가
   * 안 눌렸다 (L-stage 리뷰 r1). 지금은 CTA가 겹치지 않지만 프레임이 `inert`라 잃는 것이 없어 그대로 둔다.
   */
  it("sticky 층이 포인터를 받지 않는다", async () => {
    const { container } = await mount();
    const sticky = find<HTMLElement>(container, "[data-landing-frame]").parentElement;
    expect(sticky?.className).toContain("sticky");
    expect(sticky?.className).toContain("pointer-events-none");
  });

  /**
   * ⚠️ **준비 전엔 프레임이 보이지 않는다** (L-stage 리뷰 r1) — 배율이 없으면 베젤·그림자가 1464×834로 서서 1262폭 스크롤러를
   * 넘치고, H < 732면 CTA까지 덮는다. 트랙은 패널 1개로 접힌 채이고 `data-ready`가 서야 프레임·크롬이 보인다.
   */
  it("`data-ready` 전엔 프레임과 크롬이 보이지 않고, 선 뒤에 보인다", async () => {
    const { container } = await mount();
    const track = find<HTMLElement>(container, "section[aria-label='How Malmoi works']");
    const frameNode = find<HTMLElement>(container, "[data-landing-frame]");
    const chrome = find<HTMLElement>(container, "[data-landing-chrome]");
    expect(track.className).toContain("group/track");
    for (const node of [frameNode, chrome]) {
      expect(node?.className).toMatch(/(^|\s)invisible(\s|$)/);
      expect(node?.className).toContain("group-data-[ready]/track:visible");
    }
  });

  /**
   * ⚠️ **스테이지가 `style.transform`을 쓰는 요소에 Tailwind 변형 유틸을 두지 않는다** (#111). v4의 `scale-*`·`translate-*`·
   * `rotate-*`는 개별 CSS 속성(`scale` 등)이라 인라인 `transform`과 **곱해진다** — `scale-x-0`이 채움을 늘 0으로 만들었다.
   * jsdom은 합성을 안 하므로 클래스로 센다.
   */
  it("transform을 쓰는 요소에 `scale-*`·`translate-*`·`rotate-*` 유틸이 없다", async () => {
    const { container } = await mount();
    await flush();
    const written = [...container.querySelectorAll<HTMLElement>("*")].filter((node) => node.style.transform !== "");
    expect(written.length).toBeGreaterThanOrEqual(7); // 프레임 · 크롬 · 진행 칸 다섯
    for (const node of written) expect(node.className).not.toMatch(/(^|\s)-?(scale|translate|rotate)-/);
    // SSR 초깃값도 같은 메커니즘(인라인 transform)이다.
    const segments = [...container.querySelectorAll<HTMLElement>("[data-landing-segment]")];
    expect(segments).toHaveLength(5);
  });

  /**
   * ⚠️ **재생 동안 CTA가 보이지 않는다** (2026-09-27 사용자) — 옛 구조는 CTA를 `−yPin`만큼 끌어올려 씬 ⑤ 끝에서 목업 아래로
   * 비쳐 들어왔다. 지금 CTA는 트랙 **뒤**의 형제이고 끌어올리지 않는다 — 고정이 풀린 뒤에만 올라온다.
   */
  it("마무리 CTA는 트랙 뒤의 형제이고 음수 margin이 없다", async () => {
    const { container } = await mount();
    await flush();
    const track = find<HTMLElement>(container, "section[aria-label='How Malmoi works']");
    const cta = find<HTMLElement>(container, "[aria-labelledby=cta]");
    expect(track.nextElementSibling).toBe(cta);
    expect(container.innerHTML).not.toContain("landing-y-pin");
    expect(find<HTMLElement>(container, "[data-landing-root]").style.getPropertyValue("--landing-y-pin")).toBe("");
  });
});

/**
 * **히어로는 `lg` 미만에서 표시급이 한 단계 내려간다** (D3 · design §3 — 2026-10-10 사용자). 서버 컴포넌트라 DOM으로 못 세우고
 * 소스로 센다: h1 48/1.1 → 30/1.2 · 본문 18 → 16(`text-prose`) · 위 여백·목업 앞 간격 120 → 64. 굵기·자간·좌우 32와 `lg` 이상은 그대로다.
 */
describe("히어로 — lg 미만 표시급 하향", () => {
  const page = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
  const stage = readFileSync(join(process.cwd(), "components/landing/stage.tsx"), "utf8");
  /** 앵커가 든 여는 태그 — 속성이 앵커 앞뒤 어디에 있어도 잡도록 태그 시작에서 한 덩어리를 자른다. */
  const classOf = (source: string, anchor: string) => {
    const at = source.indexOf(anchor);
    expect(at).toBeGreaterThan(-1);
    const start = source.lastIndexOf("<", at);
    return source.slice(start, start + 420);
  };

  it("h1 — 30/1.2에서 `lg`부터 48/1.1, 굵기 600", () => {
    const h1 = classOf(page, 'id="landing-hero"');
    for (const cls of ["text-3xl", "leading-[1.2]", "lg:text-5xl", "lg:leading-[1.1]", "font-semibold"]) expect(h1).toContain(cls);
    expect(h1).not.toMatch(/(^|[\s"])text-5xl/);
  });

  it("본문 — 16에서 `lg`부터 18", () => {
    const body = classOf(page, "{hero.body}");
    expect(body).toContain("text-prose");
    expect(body).toContain("lg:text-lg");
    expect(body).not.toMatch(/(^|[\s"])text-lg/);
  });

  it("히어로 위 여백과 목업 앞 간격 — 64에서 `lg`부터 120, 좌우 32는 그대로", () => {
    const section = classOf(page, 'aria-labelledby="landing-hero"');
    for (const cls of ["pt-16", "lg:pt-30", "px-8"]) expect(section).toContain(cls);
    expect(section).not.toMatch(/(^|[\s"])pt-30/);
    const track = classOf(stage, "aria-label={label}");
    for (const cls of ["mt-16", "lg:mt-30"]) expect(track).toContain(cls);
    expect(track).not.toMatch(/(^|[\s"])mt-30/);
  });

  /** D15 — 마무리 CTA h2도 표시급이라 히어로 h1과 같이 한 단계 내려간다. */
  it("마무리 CTA h2 — 30/1.2에서 `lg`부터 48/1.1, 굵기 600", () => {
    const h2 = classOf(page, 'id="landing-closing"');
    for (const cls of ["text-3xl", "leading-[1.2]", "lg:text-5xl", "lg:leading-[1.1]", "font-semibold"]) expect(h2).toContain(cls);
    expect(h2).not.toMatch(/(^|[\s"])text-5xl/);
  });
});
