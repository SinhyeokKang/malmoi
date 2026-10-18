// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DotField } from "@/components/signin/dot-field";

import { render } from "./helpers/dom";

/**
 * jsdom엔 Canvas가 없다 — 2D 컨텍스트를 기록기로 바꾼다. `fills`는 `fillStyle` 대입, `calls`는 메서드 호출(`[이름, 인자]`)과
 * `globalAlpha` 대입(`["globalAlpha", [값]]`)이고 `clearRect` 하나가 그리기 한 번의 시작이다.
 */
function stubContext() {
  const fills: string[] = [];
  const calls: [string, number[]][] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => (key in target ? target[key] : (...args: number[]) => { calls.push([String(key), args]); }),
    set: (target, key, value) => {
      if (key === "fillStyle") fills.push(String(value));
      if (key === "globalAlpha") calls.push(["globalAlpha", [Number(value)]]);
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

  /**
   * jsdom은 레이아웃이 없어 `scrollTop`을 정하지 않는다 — 값을 박고 `scroll`을 쏜다. 스크롤 범위는 `[0, 1600]`이다
   * (`scrollHeight` 2000 − `clientHeight` 400). 컴포넌트가 그 범위로 자르기 때문이다(고무줄 스크롤 — `clampScrollTop`).
   */
  async function scrollTo(scroller: HTMLElement, top: number) {
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scroller, "scrollTop", { configurable: true, value: top });
    await act(async () => { scroller.dispatchEvent(new Event("scroll")); });
  }

  const rowsOf = (draw: Calls) => [...new Set(draw.flatMap(([name, args]) => (name === "arc" && args[1] !== undefined ? [args[1]] : [])))];

  /** rAF를 손으로 돌린다 — 루프가 도는 경로(모션 허용)를 결정적으로 본다. */
  function manualFrames() {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
    return async () => { await act(async () => frames.at(-1)?.(0)); };
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
    const rows = () => rowsOf(lastDraw(calls));
    expect(Math.min(...rows())).toBe(0);
    await scrollTo(scroller, 4);
    expect(Math.min(...rows())).toBe(-4);
    expect(Math.max(...rows())).toBeGreaterThanOrEqual(400);
    await scrollTo(scroller, 36);
    expect(Math.min(...rows())).toBe(-4);
    await scrollTo(scroller, 48);
    expect(Math.min(...rows())).toBe(0);
  });

  /**
   * ⚠️ **고무줄 스크롤에선 범위로 자른 값으로 그린다**(Y1) — 위 끝 튕김에서 sticky 캔버스는 콘텐츠와 같이 내려가므로 오프셋은 0이다.
   * 음수를 양수 위상으로 접으면(-5 → 11) 점이 콘텐츠의 두 배 속도로 미끄러진다. 아래 끝도 같다(최대값 1600 → 위상 0).
   */
  it("범위 밖 scrollTop은 잘라서 쓴다 — 튕기는 동안 점이 콘텐츠에 붙어 있다", async () => {
    const { calls } = stubContext();
    sized();
    motion(true);
    const { scroller } = await mount();
    await scrollTo(scroller, -5);
    expect(Math.min(...rowsOf(lastDraw(calls)))).toBe(0);
    await scrollTo(scroller, 1612);
    expect(Math.min(...rowsOf(lastDraw(calls)))).toBe(0);
    await scrollTo(scroller, 1595);
    expect(Math.min(...rowsOf(lastDraw(calls)))).toBe(-(1595 % 16));
  });

  /**
   * ⚠️ **루프가 도는 동안 `scroll`은 그리지 않는다**(Y3) — 다음 프레임이 `scrollTop`을 읽는다. 그리면 스크롤 중 프레임마다
   * 1만 3천 점을 두 번 그린다.
   */
  it("모션 허용이면 scroll이 그리기를 더하지 않고, 다음 프레임이 잘린 위상으로 그린다", async () => {
    const { calls } = stubContext();
    sized();
    motion(false);
    const frame = manualFrames();
    const { scroller } = await mount();
    await frame();
    const before = drawCount(calls);
    await scrollTo(scroller, 21);
    expect(drawCount(calls)).toBe(before);
    await frame();
    expect(drawCount(calls)).toBe(before + 1);
    expect(Math.min(...rowsOf(lastDraw(calls)))).toBe(-(21 % 16));
    await scrollTo(scroller, -7);
    expect(drawCount(calls)).toBe(before + 1);
    await frame();
    expect(Math.min(...rowsOf(lastDraw(calls)))).toBe(0);
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

  /**
   * ⚠️ **묶음의 알파와 `moveTo`**(Y2). 묶음 `fill` 직전 알파는 기본값(0.08)이어야 한다 — 이 대입이 없으면 앞 프레임 마지막 근접 점의
   * 알파(최대 0.3)로 반경 밖 1만여 점이 칠해진다. 점마다 같은 중심의 `moveTo(x + 2, y)`가 없으면 `arc`가 앞 점에서 선을 이어 그 선까지 칠한다.
   */
  it("묶음 fill은 알파 0.08로 칠하고, 근접 점을 그린 다음 프레임에도 0.08이다 — arc마다 moveTo가 앞선다", async () => {
    const { calls } = stubContext();
    sized();
    motion(false);
    vi.spyOn(performance, "now").mockReturnValue(0);
    const frame = manualFrames();
    const { scroller } = await mount();
    await act(async () => { scroller.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", clientX: 208, clientY: 208 })); });

    /** 전체 기록에서 i번째 호출 앞의 마지막 알파 — 이번 프레임이 대입하지 않았으면 앞 프레임 값이 나온다(캔버스 상태는 이어진다). */
    const alphaBefore = (index: number) => calls.slice(0, index).findLast(([name]) => name === "globalAlpha")?.[1][0];
    const check = () => {
      const start = calls.map(([name]) => name).lastIndexOf("clearRect");
      const fill = calls.findIndex(([name], i) => i > start && name === "fill");
      expect(alphaBefore(fill)).toBe(0.08);
      const path = calls.slice(calls.findIndex(([name], i) => i > start && name === "beginPath"), fill);
      const arcs = path.flatMap(([name], i) => (name === "arc" ? [i] : []));
      expect(arcs.length).toBeGreaterThan(0);
      for (const i of arcs) {
        const [x = Number.NaN, y = Number.NaN, r] = path[i]?.[1] ?? [];
        expect(r).toBe(2);
        expect(path[i - 1]).toEqual(["moveTo", [x + 2, y]]);
      }
      return calls.slice(fill).flatMap(([name, args]) => (name === "globalAlpha" ? [args[0]] : []));
    };

    await frame();
    const nearAlphas = check();
    // 이 프레임은 근접 점을 그렸고 마지막 알파가 기본값보다 크다 — 다음 프레임의 묶음이 그 값을 물려받으면 안 된다.
    expect(Math.max(...nearAlphas.map(Number))).toBeGreaterThan(0.08);
    expect(alphaBefore(calls.length)).toBeGreaterThan(0.08);
    await frame();
    check();
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
   * 시각을 고정해 자동 순회를 원점(0, 0)에 묶는다 — (208, 208)과의 거리가 반경 180보다 멀다. 실제 시각이면 느린 러너에서 가상 커서가
   * 둘째 줄에 들어와 단언이 흔들린다.
   */
  it("pointerType이 mouse일 때만 점이 커서를 따라온다 — 터치는 자동 순회 그대로", async () => {
    const { calls } = stubContext();
    sized();
    motion(false);
    vi.spyOn(performance, "now").mockReturnValue(0);
    const frame = manualFrames();
    const { scroller } = await mount();
    const move = async (type: string, pointerType: string) => {
      await act(async () => { scroller.dispatchEvent(new PointerEvent(type, { pointerType, clientX: 208, clientY: 208 })); });
      await frame();
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
