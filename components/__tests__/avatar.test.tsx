// @vitest-environment jsdom
import { act } from "react";
import { expect, it } from "vitest";

import { Avatar } from "@/components/ui/avatar";

import { find, render } from "./helpers/dom";

it.each([24, 32, 56] as const)("크기 %s의 사진·이니셜이 원형·치수·클래스 override를 보존한다", async (size) => {
  for (const src of [undefined, "https://example.com/avatar.webp"]) {
    const { container } = await render(<Avatar name="Malmoi" size={size} src={src} className="opacity-50" />);
    const node = container.firstElementChild as HTMLElement;
    expect(node.classList.contains("rounded-full")).toBe(true);
    expect(node.classList.contains("opacity-50")).toBe(true);
    expect(node.style.width).toBe(`${size}px`);
    expect(node.style.height).toBe(`${size}px`);
    if (src === undefined) {
      expect(node.textContent).toBe("M");
      expect(node.classList.contains(size === 56 ? "text-xl" : "text-xs")).toBe(true);
    } else {
      expect(node.tagName).toBe("IMG");
      expect(node.classList.contains("object-cover")).toBe(true);
      expect(node.getAttribute("alt")).toBe("");
    }
  }
});

/**
 * **사진이 안 뜨면 이니셜로 떨어진다** (malmoi#50).
 *
 * ⚠️ 공급자 사진 URL(`lh3.googleusercontent.com` 등)은 핫링크다 — Blob을 지나는 것은 업로드한 사진뿐이라
 * 공급자 쪽 일시 실패·만료가 그대로 이 컴포넌트에 온다. `src`가 있다는 것은 "보인다"가 아니다.
 */
it("이미지 로드가 실패하면 `src`가 없을 때와 같은 이니셜 원을 그린다", async () => {
  const { container } = await render(<Avatar name="sinhyeok" src="https://lh3.googleusercontent.com/a/broken" size={32} />);
  const img = find<HTMLImageElement>(container, "img");

  await act(async () => { img.dispatchEvent(new Event("error")); });

  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("S");
  const fallback = await render(<Avatar name="sinhyeok" size={32} />);
  expect(container.innerHTML).toBe(fallback.container.innerHTML);
});

it("`src`가 바뀌면 새 사진을 다시 시도한다 — 한 번 실패가 다음 사진까지 가리지 않는다", async () => {
  const view = await render(<Avatar name="sinhyeok" src="https://example.com/a.webp" />);
  await act(async () => { find(view.container, "img").dispatchEvent(new Event("error")); });
  expect(view.container.querySelector("img")).toBeNull();

  await view.rerender(<Avatar name="sinhyeok" src="https://example.com/b.webp" />);
  expect(find<HTMLImageElement>(view.container, "img").getAttribute("src")).toBe("https://example.com/b.webp");
});

/**
 * ⚠️ **하이드레이션 전에 난 실패는 `onError`가 못 받는다** — `/account`는 서버가 `<img>`를 그리고,
 * 브라우저가 JS보다 먼저 실패를 끝내면 React가 붙을 때 이벤트는 이미 지나갔다. 이슈의 실측이 정확히
 * 그 모양이었다(`complete = true`, `naturalWidth = 0`). 붙는 순간 한 번 본다.
 */
it("붙는 시점에 이미 깨져 있는 이미지(complete·naturalWidth 0)도 이니셜로 떨어진다", async () => {
  const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
  const natural = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");
  Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 0 });
  try {
    const { container } = await render(<Avatar name="sinhyeok" src="https://lh3.googleusercontent.com/a/broken" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("S");
  } finally {
    if (complete) Object.defineProperty(HTMLImageElement.prototype, "complete", complete);
    if (natural) Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", natural);
  }
});

/** 빈 이름의 ?도 동일한 sky 면이어야 기존 멤버·계정 폴백과 갈리지 않는다. */
it.each([["", "?", "bg-sky-600"], ["Acme", "A", "bg-fuchsia-600"]])("%s preserves initial and hue background", async (name, initial, hueClass) => {
  const { container } = await render(<Avatar name={name} />);
  expect(container.textContent).toBe(initial);
  expect(container.firstElementChild?.classList.contains(hueClass)).toBe(true);
  expect(container.firstElementChild?.classList.contains("text-white")).toBe(true);
});
