// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DotField } from "@/components/signin/dot-field";

import { render } from "./helpers/dom";

/**
 * jsdom엔 Canvas가 없다 — 2D 컨텍스트를 기록기로 바꾼다. `fills`는 `fillStyle` 대입, `calls`는 메서드 호출(`[이름, 인자]`)이고
 * `clearRect` 하나가 그리기 한 번의 시작이다.
 */
function stubContext() {
  const fills: string[] = [];
  const calls: [string, number[]][] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => (key in target ? target[key] : (...args: number[]) => { calls.push([String(key), args]); }),
    set: (target, key, value) => {
      if (key === "fillStyle") fills.push(String(value));
      target[key] = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return { fills, calls };
}

/** 400×400 캔버스 — jsdom의 `getBoundingClientRect`는 0이라 그대로면 격자가 점 하나다. 400 / 16 → 26 × 26점. */
function sized() {
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: 400, height: 400, top: 0, left: 0, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }));
}

function motion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduced-motion"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList);
}

type Calls = [string, number[]][];
const lastDraw = (calls: Calls) => calls.slice(calls.map(([name]) => name).lastIndexOf("clearRect"));
const drawCount = (calls: Calls) => calls.filter(([name]) => name === "clearRect").length;
/** (x, y) 점을 그린 `arc`의 반지름들. */
const arcsAt = (draw: Calls, x: number, y: number) => draw.flatMap(([name, args]) => (name === "arc" && args[0] === x && args[1] === y ? [args[2]] : []));

/**
 * 리스너가 **어느 요소에** 붙었나 — 캔버스냐 스크롤러냐가 `follow`의 요지다. ⚠️ React 루트도 컨테이너에 `pointermove`를 위임하므로
 * 캔버스·스크롤러만 센다.
 */
function spyListeners() {
  const add = vi.spyOn(EventTarget.prototype, "addEventListener");
  const remove = vi.spyOn(EventTarget.prototype, "removeEventListener");
  const ours = (target: unknown) => target instanceof HTMLCanvasElement || (target instanceof HTMLElement && target.hasAttribute("data-public-scroller"));
  const on = (spy: typeof add, type: string) =>
    spy.mock.calls.flatMap((args, i) => (args[0] === type && ours(spy.mock.contexts[i]) ? [{ target: spy.mock.contexts[i], listener: args[1], options: args[2] }] : []));
  return { added: (type: string) => on(add, type), removed: (type: string) => on(remove, type) };
}

/**
 * **로그인 점 색은 계산된 `color`에서 읽는다** (color-scheme design §3.5). `--signin-dot`이 `light-dark()`가 되면 사용자 정의 속성은
 * 선언 문자열을 돌려주고 Canvas `fillStyle`은 그것을 모른다 — 브라우저가 풀어 준 `color`를 읽는다. System이면 OS 테마가 바뀔 때 다시 읽는다.
 * jsdom은 Canvas도 `var()` 해석도 없어 둘 다 스텁이다 — 여기서 보는 것은 **배선**(무엇을 읽고 언제 다시 읽는가)이다.
 */
describe("DotField", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup() {
    const { fills, calls } = stubContext();
    let dotColor = "rgb(37, 99, 235)";
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const style = real(element, pseudo);
      if (!(element instanceof HTMLCanvasElement)) return style;
      return new Proxy(style, {
        get: (target, key) => {
          if (key === "color") return dotColor;
          if (key === "getPropertyValue") return (name: string) => (name === "--signin-dot" ? "light-dark(rgb(37 99 235), var(--color-blue-400))" : target.getPropertyValue(name));
          return Reflect.get(target, key);
        },
      });
    });
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (query: string) => ({
      // 움직임 줄이기를 켜 둔다 — rAF 루프 없이 그릴 때마다 한 프레임이다.
      matches: query.includes("reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: () => void) => { if (query.includes("prefers-color-scheme")) listeners.add(listener); },
      removeEventListener: (_: string, listener: () => void) => { listeners.delete(listener); },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);
    return { fills, calls, listeners, setColor: (color: string) => { dotColor = color; } };
  }

  it("캔버스의 계산된 `color`(= `var(--signin-dot)`)로 칠한다 — 사용자 정의 속성의 선언 문자열이 아니다", async () => {
    const { fills } = setup();
    const { container } = await render(<DotField />);
    expect(container.querySelector("canvas")?.getAttribute("style")).toMatch(/color:\s*var\(--signin-dot\)/);
    expect(fills.length).toBeGreaterThan(0);
    expect(new Set(fills)).toEqual(new Set(["rgb(37, 99, 235)"]));
  });

  it("OS 테마가 바뀌면 색을 다시 읽어 다시 그린다 — 떠나면 구독을 푼다", async () => {
    const { fills, listeners, setColor } = setup();
    const { rerender } = await render(<DotField />);
    expect(listeners.size).toBe(1);
    setColor("rgb(81, 162, 255)");
    await act(async () => { for (const listener of listeners) listener(); });
    expect(fills.at(-1)).toBe("rgb(81, 162, 255)");
    await rerender(null);
    expect(listeners.size).toBe(0);
  });

  /**
   * ⚠️ **`display:none`인 동안 rAF 루프를 돌리지 않는다** — `lg` 미만에서 장식이 CSS로 숨으면 캔버스 폭이 0이다.
   * 렌더 시점의 폭 판정이 아니라 effect 안의 실측이다(design §2). 다시 보이면(폭 > 0) 루프가 시작된다.
   */
  it("캔버스가 숨어 폭이 0이면 애니메이션 루프를 시작하지 않고, 보이면 시작한다", async () => {
    setup();
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList);
    let width = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width, height: width, top: 0, left: 0, right: width, bottom: width, x: 0, y: 0, toJSON: () => ({}) }));
    let notify: () => void = () => undefined;
    vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { notify = cb; } observe() {} unobserve() {} disconnect() {} });
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    await render(<DotField />);
    expect(raf).not.toHaveBeenCalled();
    width = 400;
    await act(async () => notify());
    expect(raf).toHaveBeenCalled();
    // 보이다 → 숨음(1024 → 1023) — 정지 줄이 없으면 숨은 동안 루프가 계속 돈다.
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    raf.mockClear();
    cancel.mockClear();
    width = 0;
    await act(async () => notify());
    expect(cancel).toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
  });
  it("기본(`follow` 없음)은 지금처럼 캔버스에서 포인터를 받는다 — 스크롤러 안에 있어도 스크롤러에 붙지 않는다", async () => {
    setup();
    sized();
    motion(false);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const listeners = spyListeners();
    const { container } = await render(<div data-public-scroller=""><DotField /></div>);
    const canvas = container.querySelector("canvas");
    expect(listeners.added("pointermove").map(({ target }) => target)).toEqual([canvas]);
    expect(listeners.added("pointerleave").map(({ target }) => target)).toEqual([canvas]);
    expect(listeners.added("scroll")).toEqual([]);
  });

  /** ⚠️ 로그인은 점마다 `fill`이다 — 묶음 그리기(R8)는 `follow="scroller"`만 탄다. */
  it("기본은 점마다 칠한다(fill 수 = 점 수)", async () => {
    const { calls } = setup();
    sized();
    await render(<DotField />);
    expect(lastDraw(calls).filter(([name]) => name === "fill").length).toBe(26 * 26);
  });
});

/**
 * **랜딩 배경** (landing-kv-background design §3) — 캔버스는 한 화면짜리 sticky이고 `pointer-events: none`이라 내용 아래에 깔린다.
 * 격자는 스크롤러의 `scrollTop`만큼 올라가고(R6), 포인터는 가장 가까운 `[data-public-scroller]`에서 받으며(R7), 반경 밖 점은 한 번에 칠한다(R8).
 */
describe("DotField follow=\"scroller\"", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function mount() {
    const { container, rerender } = await render(<div data-public-scroller=""><DotField follow="scroller" /></div>);
    const scroller = container.querySelector<HTMLElement>("[data-public-scroller]");
    if (scroller === null) throw new Error("Missing scroller");
    return { scroller, canvas: container.querySelector("canvas"), rerender };
  }

  /** jsdom은 레이아웃이 없어 `scrollTop`을 정하지 않는다 — 값을 박고 `scroll`을 쏜다. */
  async function scrollTo(scroller: HTMLElement, top: number) {
    Object.defineProperty(scroller, "scrollTop", { configurable: true, value: top });
    await act(async () => { scroller.dispatchEvent(new Event("scroll")); });
  }

  it("모션 감소면 rAF가 0이고, 스크롤 한 번에 한 번만 다시 그린다", async () => {
    const { calls } = stubContext();
    sized();
    motion(true);
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const { scroller } = await mount();
    const before = drawCount(calls);
    await scrollTo(scroller, 4);
    expect(drawCount(calls)).toBe(before + 1);
    await scrollTo(scroller, 9);
    expect(drawCount(calls)).toBe(before + 2);
    expect(raf).not.toHaveBeenCalled();
  });

  it("격자가 scrollTop % 16만큼 올라가 그려진다 — 16px마다 원위치", async () => {
    const { calls } = stubContext();
    sized();
    motion(true);
    const { scroller } = await mount();
    const rows = () => [...new Set(lastDraw(calls).flatMap(([name, args]) => (name === "arc" && args[1] !== undefined ? [args[1]] : [])))];
    expect(Math.min(...rows())).toBe(0);
    await scrollTo(scroller, 4);
    expect(Math.min(...rows())).toBe(-4);
    expect(Math.max(...rows())).toBeGreaterThanOrEqual(400);
    await scrollTo(scroller, 36);
    expect(Math.min(...rows())).toBe(-4);
    await scrollTo(scroller, 48);
    expect(Math.min(...rows())).toBe(0);
  });

  /** R8 — 커서가 없으면 점이 전부 반경 밖이라 path 하나에 모아 `fill` 한 번이다. */
  it("반경 밖 점은 묶어서 fill 한 번으로 칠한다", async () => {
    const { calls } = stubContext();
    sized();
    motion(true);
    await mount();
    const draw = lastDraw(calls);
    expect(draw.filter(([name]) => name === "fill").length).toBe(1);
    expect(draw.filter(([name]) => name === "arc").length).toBe(26 * 26);
  });

  it("포인터·스크롤 리스너는 캔버스가 아니라 스크롤러에 붙고, 떠나면 모두 떨어진다", async () => {
    stubContext();
    sized();
    motion(false);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const listeners = spyListeners();
    const { scroller, rerender } = await mount();
    for (const type of ["pointermove", "pointerleave", "scroll"]) {
      expect(listeners.added(type).map(({ target }) => target)).toEqual([scroller]);
    }
    expect(listeners.added("scroll")[0]?.options).toEqual({ passive: true });
    await rerender(null);
    for (const type of ["pointermove", "pointerleave", "scroll"]) {
      expect(listeners.removed(type).map(({ target, listener }) => [target, listener])).toEqual(listeners.added(type).map(({ target, listener }) => [target, listener]));
    }
  });

  /**
   * ⚠️ **마우스만 실제 커서다**(orch D7) — 터치 기기는 자동 순회가 상시 돈다(D3). 탭·드래그가 가상 커서를 탭 자리로 끌면 그 약속이 깨진다.
   * 자동 순회는 첫 줄(y = 0)을 1초 넘게 훑으므로 (208, 208)과의 거리가 반경 180보다 멀다.
   */
  it("pointerType이 mouse일 때만 점이 커서를 따라온다 — 터치는 자동 순회 그대로", async () => {
    const { calls } = stubContext();
    sized();
    motion(false);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
    const { scroller } = await mount();
    const move = async (type: string, pointerType: string) => {
      await act(async () => { scroller.dispatchEvent(new PointerEvent(type, { pointerType, clientX: 208, clientY: 208 })); });
      await act(async () => frames.at(-1)?.(0));
    };

    await move("pointermove", "touch");
    expect(arcsAt(lastDraw(calls), 208, 208)).toEqual([2]);
    await move("pointermove", "mouse");
    expect(arcsAt(lastDraw(calls), 208, 208)).toEqual([3.5]);
    await move("pointerleave", "mouse");
    expect(arcsAt(lastDraw(calls), 208, 208)).toEqual([2]);
  });

  it("스크롤러를 못 찾으면 기본처럼 캔버스에서 받는다", async () => {
    stubContext();
    sized();
    motion(false);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const listeners = spyListeners();
    const { container } = await render(<DotField follow="scroller" />);
    expect(listeners.added("pointermove").map(({ target }) => target)).toEqual([container.querySelector("canvas")]);
    expect(listeners.added("scroll")).toEqual([]);
  });
});
