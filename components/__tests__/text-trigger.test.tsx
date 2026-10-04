// @vitest-environment jsdom
import { act, createRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TextTrigger } from "@/components/ui/text-trigger";

import { find, key, render } from "./helpers/dom";

/**
 * `TextTrigger` (ui-locales design §5.1 — F2a). 푸터 링크(13/400 muted)와 같은 무게의 누르는 글자다 — `Button`은 500을 강제해 이웃 링크와 갈린다.
 * ⚠️ `busy`는 진짜 `disabled`가 아니다 — 꺼지면 Radix가 메뉴를 닫으며 돌려준 포커스가 `body`로 빠진다(POSTMORTEM 2026-09-24).
 */

// jsdom에는 disabled focus fixup이 없다 — 꺼진 노드 위의 포커스를 브라우저처럼 떨어뜨려 "포커스 유지"가 우연히 green이 되지 않게 한다.
let fixup: MutationObserver;
beforeEach(() => {
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches(":disabled")) { active.removeAttribute("disabled"); active.blur(); active.setAttribute("disabled", ""); }
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
});
afterEach(() => fixup.disconnect());

const glyph = <svg data-glyph="lead" aria-hidden />;
const trailing = <svg data-glyph="trail" aria-hidden />;

it("13/400 muted 텍스트 버튼이고 푸터 링크와 같은 hover·focus 링을 든다", async () => {
  const { container } = await render(<TextTrigger>{glyph}<span>English</span>{trailing}</TextTrigger>);
  const button = find<HTMLButtonElement>(container, "button");
  expect(button.type).toBe("button");
  for (const cls of ["inline-flex", "items-center", "gap-1", "text-xs", "text-muted-foreground", "hover:text-foreground", "focus-visible:ring-ring", "focus-visible:ring-2", "focus-visible:outline-none"]) {
    expect(button.classList, cls).toContain(cls);
  }
  expect([...button.classList].some((cls) => /^font-(medium|semibold|bold)$/.test(cls))).toBe(false);
  // 앞 글리프 · 라벨 · 뒤 글리프 순이다.
  expect([...button.children].map((node) => node.getAttribute("data-glyph") ?? node.textContent)).toEqual(["lead", "English", "trail"]);
});

it("busy면 앞 글리프(aria-hidden 첫 자식)를 스피너로 교체하고 aria-disabled·aria-busy를 든다 — 진짜 disabled가 아니다", async () => {
  const { container } = await render(<TextTrigger busy>{glyph}English{trailing}</TextTrigger>);
  const button = find<HTMLButtonElement>(container, "button");
  expect(button.disabled).toBe(false);
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button.classList).toContain("cursor-not-allowed");
  expect(container.querySelector('[data-glyph="lead"]')).toBeNull();
  expect(container.querySelector(".animate-spin")).not.toBeNull();
  expect(container.querySelector('[data-glyph="trail"]')).not.toBeNull();
});

it("busy면 클릭·키 입력이 먹지 않고 포커스가 남는다", async () => {
  const onClick = vi.fn();
  const onKeyDown = vi.fn();
  const { container } = await render(<TextTrigger busy onClick={onClick} onKeyDown={onKeyDown}>{glyph}English</TextTrigger>);
  const button = find<HTMLButtonElement>(container, "button");
  await act(async () => { button.focus(); button.click(); });
  await key(button, "Enter");
  expect(onClick).not.toHaveBeenCalled();
  expect(onKeyDown).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button);
});

it("ref를 버튼까지 전달한다 — DropdownMenuTrigger asChild가 받는다", async () => {
  const ref = createRef<HTMLButtonElement>();
  const { container } = await render(<TextTrigger ref={ref}>English</TextTrigger>);
  expect(ref.current).toBe(find(container, "button"));
});

it("DropdownMenuTrigger asChild로 메뉴를 열고, busy면 열리지 않는다", async () => {
  const menu = (busy: boolean) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><TextTrigger busy={busy}>English</TextTrigger></DropdownMenuTrigger>
      <DropdownMenuContent><DropdownMenuItem>한국어</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>
  );
  const { container, rerender } = await render(menu(true));
  const button = find<HTMLButtonElement>(container, "button");
  expect(button.getAttribute("aria-haspopup")).toBe("menu");
  await key(button, "Enter");
  expect(button.getAttribute("aria-expanded")).toBe("false");
  await rerender(menu(false));
  await key(button, "Enter");
  expect(button.getAttribute("aria-expanded")).toBe("true");
});
