// @vitest-environment jsdom
import { Search } from "lucide-react";
import { act, type ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { FieldButton } from "@/components/ui/field-button";
import { Kbd } from "@/components/ui/kbd";
import { en } from "@/messages/en";

import { find, render } from "./helpers/dom";

const props = { icon: <Search />, placeholder: "Search…", "aria-label": "Search", "aria-haspopup": "dialog", onClick: () => {} } satisfies ComponentProps<typeof FieldButton>;

it("캡슐 치수·패널 면·장식 슬롯과 접근 이름을 그린다", async () => {
  const { container } = await render(<FieldButton {...props} shortcut={<Kbd>{en.common.keys.search.mac}</Kbd>} aria-keyshortcuts="Meta+K" />);
  const button = find<HTMLButtonElement>(container, "button");
  expect(button.type).toBe("button");
  for (const token of ["rounded-full", "h-11", "w-80", "bg-background", "border", "border-border-subtle", "shadow-low", "hover:bg-primary-foreground", "focus-visible:border-ring", "focus-visible:ring-ring", "focus-visible:ring-1", "focus-visible:outline-none"]) {
    expect(button.classList.contains(token), token).toBe(true);
  }
  expect(button.getAttribute("aria-label")).toBe("Search");
  expect(button.getAttribute("aria-haspopup")).toBe("dialog");
  expect(button.hasAttribute("aria-expanded")).toBe(false);
  expect(button.classList.contains("h-9")).toBe(false);
  expect(button.getAttribute("aria-keyshortcuts")).toBe("Meta+K");
  expect(find(button, "svg").closest('[aria-hidden="true"]')).not.toBeNull();
  expect(button.children[1]?.textContent).toBe("Search…");
  expect(button.children[1]?.classList.contains("text-muted-foreground")).toBe(true);
  expect(button.children[2]?.querySelector("kbd")?.textContent).toBe(en.common.keys.search.mac);
});

it("단축키 수화 전후에 같은 폭의 빈 슬롯을 유지한다", async () => {
  const view = await render(<FieldButton {...props} />);
  const button = find<HTMLButtonElement>(view.container, "button");
  const shortcut = button.lastElementChild!;
  expect(button.children).toHaveLength(3);
  expect(shortcut.textContent).toBe("");
  expect(shortcut.classList.contains("w-16")).toBe(true);
  expect(shortcut.classList.contains("shrink-0")).toBe(true);
  expect(button.hasAttribute("aria-keyshortcuts")).toBe(false);
  await view.rerender(<FieldButton {...props} shortcut={<Kbd>{en.common.keys.search.other}</Kbd>} aria-keyshortcuts="Control+K" />);
  expect(button.lastElementChild).toBe(shortcut);
  expect(shortcut.querySelector("kbd")?.textContent).toBe(en.common.keys.search.other);
});

it("트리거가 넘긴 열림 상태를 aria-expanded로 말한다", async () => {
  const view = await render(<FieldButton {...props} aria-expanded={false} />);
  const button = find<HTMLButtonElement>(view.container, "button");
  expect(button.getAttribute("aria-expanded")).toBe("false");
  await view.rerender(<FieldButton {...props} aria-expanded />);
  expect(button.getAttribute("aria-expanded")).toBe("true");
});

it("마우스·Enter·Space가 같은 버튼 동작을 부른다", async () => {
  const onClick = vi.fn();
  const { container } = await render(<FieldButton {...props} onClick={onClick} />);
  const button = find<HTMLButtonElement>(container, "button");
  const user = userEvent.setup();
  await act(async () => { await user.click(button); await user.keyboard("{Enter} "); });
  expect(onClick).toHaveBeenCalledTimes(3);
  expect(document.activeElement).toBe(button);
});

/**
 * **`lg` 미만 아이콘 형** (responsive-public PT1a) — 같은 인스턴스가 CSS로 32 아이콘이 된다(두 벌을 그리면 ⌘K 리스너가 둘이다).
 * 좁은 형은 헤더 Inbox 트리거와 같은 ghost icon-md 꼴이고 접근 이름·단축키·팝업 속성은 그대로다. jsdom은 폭을 못 재므로 클래스로 든다.
 */
it("`compact`면 `lg` 미만에서만 32 아이콘이 되고 이름·단축키는 그대로다", async () => {
  const { container } = await render(<FieldButton {...props} compact shortcut={<Kbd>{en.common.keys.search.mac}</Kbd>} aria-keyshortcuts="Meta+K" />);
  const button = find<HTMLButtonElement>(container, "button");
  const classes = [...button.classList];
  // 넓은 폭 클래스는 그대로다 — 좁은 형 토큰은 전부 `max-lg:`다.
  for (const token of ["rounded-full", "h-11", "w-80", "border", "shadow-low"]) expect(classes, token).toContain(token);
  for (const token of ["max-lg:size-8", "max-lg:rounded-md", "max-lg:border-0", "max-lg:bg-transparent", "max-lg:shadow-none", "max-lg:px-0", "max-lg:justify-center"]) expect(classes, token).toContain(token);
  expect(button.children[0]?.classList.contains("max-lg:text-foreground")).toBe(true);
  expect(button.children[1]?.classList.contains("max-lg:hidden")).toBe(true);
  expect(button.children[2]?.classList.contains("max-lg:hidden")).toBe(true);
  expect(button.getAttribute("aria-label")).toBe("Search");
  expect(button.getAttribute("aria-keyshortcuts")).toBe("Meta+K");
  // 터치에서는 32 위로 44 히트 영역을 넓힌다(Button과 같은 상수).
  expect(classes).toContain("pointer-coarse:after:min-h-11");
});

it("`compact`가 없으면 반응 토큰이 하나도 없다 — 앱 셸 헤더·랜딩 목업은 그대로다", async () => {
  const { container } = await render(<FieldButton {...props} />);
  const button = find<HTMLButtonElement>(container, "button");
  expect(button.outerHTML).not.toMatch(/max-lg:|pointer-coarse:/);
});
