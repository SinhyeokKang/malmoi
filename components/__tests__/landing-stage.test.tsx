// @vitest-environment jsdom
import { act, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Stage } from "@/components/landing/stage";
import { frame, typedPrefix } from "@/lib/landing/stage";

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

const scene = () => <div><span data-landing-typed="" /></div>;

const stageUi = () => (
  <div data-testid="scroller" data-landing-scroller="">
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

  /**
   * ⚠️ **sticky 층은 투명하지만 positioned라** 음수 margin으로 끌어올린 CTA 위에 칠해져 클릭을 먹는다 — yPin이 120보다 큰
   * 세로 긴 뷰포트(1440×2560에서 ≈836)에서 `Get started`가 안 눌렸다 (L-stage 리뷰 r1).
   */
  it("sticky 층이 포인터를 받지 않는다 — 끌어올린 CTA가 눌린다", async () => {
    const { container } = await mount();
    const sticky = find<HTMLElement>(container, "[data-landing-frame]").parentElement;
    expect(sticky?.className).toContain("sticky");
    expect(sticky?.className).toContain("pointer-events-none");
  });

  /**
   * ⚠️ **준비 전엔 프레임이 보이지 않는다** (L-stage 리뷰 r1) — 배율이 없으면 베젤·그림자가 1304×744로 서서 1262폭 스크롤러를
   * 넘치고, H < 732면 CTA까지 덮는다. 트랙은 패널 1개로 접힌 채이고 `data-ready`가 서야 프레임·크롬이 보인다.
   */
  it("`data-ready` 전엔 프레임과 크롬이 보이지 않고, 선 뒤에 보인다", async () => {
    const { container } = await mount();
    const track = find<HTMLElement>(container, "section[aria-label='How Malmoi works']");
    const frameNode = find<HTMLElement>(container, "[data-landing-frame]");
    const chrome = find<HTMLElement>(container, "[data-landing-caption]").parentElement;
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
   * ⚠️ **CTA가 트랙 위에서 히트 테스트를 이겨야 한다** (#113). 트랙 `<section>`은 positioned라 음수 margin으로 끌어올린
   * static CTA 위에 칠해졌고, yPin ≈ 836인 1440×2560에서 `Get started`가 안 눌렸다.
   */
  it("마무리 CTA 래퍼가 트랙보다 위 층이다", async () => {
    const { container } = await mount();
    const wrapper = find<HTMLElement>(container, "[aria-labelledby=cta]").parentElement;
    expect(wrapper?.className).toMatch(/(^|\s)relative(\s|$)/);
    expect(wrapper?.className).toMatch(/(^|\s)z-10(\s|$)/);
  });

  it("마무리 CTA는 스테이지 뒤에 서고 `−yPin`을 상쇄하는 자리에 들어간다", async () => {
    const { container } = await mount();
    await flush();
    const cta = find<HTMLElement>(container, "[aria-labelledby=cta]");
    expect(cta.parentElement?.className).toContain("mt-[calc(-1*var(--landing-y-pin,0px))]");
    expect(find<HTMLElement>(container, "[data-landing-root]").style.getPropertyValue("--landing-y-pin")).toBe(`${at(0).yPin}px`);
  });
});
