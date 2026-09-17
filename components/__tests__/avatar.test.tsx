// @vitest-environment jsdom
import { act } from "react";
import { expect, it } from "vitest";

import { Avatar } from "@/components/ui/avatar";

import { find, render } from "./helpers/dom";

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
