// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DotField } from "@/components/signin/dot-field";

import { render } from "./helpers/dom";

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
    const fills: string[] = [];
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (target, key) => (key in target ? target[key] : () => undefined),
      set: (target, key, value) => {
        if (key === "fillStyle") fills.push(String(value));
        target[key] = value;
        return true;
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
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
    return { fills, listeners, setColor: (color: string) => { dotColor = color; } };
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
  });
});
