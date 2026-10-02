// @vitest-environment jsdom
import { Search } from "lucide-react";
import { act, type ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { FieldButton } from "@/components/ui/field-button";
import { Kbd } from "@/components/ui/kbd";

import { find, render } from "./helpers/dom";

const props = { icon: <Search />, placeholder: "Search…", "aria-label": "Search", "aria-haspopup": "dialog", onClick: () => {} } satisfies ComponentProps<typeof FieldButton>;

it("캡슐 치수·패널 면·장식 슬롯과 접근 이름을 그린다", async () => {
  const { container } = await render(<FieldButton {...props} shortcut={<Kbd>⌘K</Kbd>} aria-keyshortcuts="Meta+K" />);
  const button = find<HTMLButtonElement>(container, "button");
  expect(button.type).toBe("button");
  for (const token of ["rounded-full", "h-9", "w-80", "bg-background", "border", "border-border-subtle", "shadow-low", "hover:bg-foreground/[0.03]", "focus-visible:border-ring", "focus-visible:ring-ring", "focus-visible:ring-1", "focus-visible:outline-none"]) {
    expect(button.classList.contains(token), token).toBe(true);
  }
  expect(button.getAttribute("aria-label")).toBe("Search");
  expect(button.getAttribute("aria-haspopup")).toBe("dialog");
  expect(button.getAttribute("aria-keyshortcuts")).toBe("Meta+K");
  expect(find(button, "svg").closest('[aria-hidden="true"]')).not.toBeNull();
  expect(button.children[1]?.textContent).toBe("Search…");
  expect(button.children[1]?.classList.contains("text-muted-foreground")).toBe(true);
  expect(button.children[2]?.querySelector("kbd")?.textContent).toBe("⌘K");
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
  await view.rerender(<FieldButton {...props} shortcut={<Kbd>Ctrl K</Kbd>} aria-keyshortcuts="Control+K" />);
  expect(button.lastElementChild).toBe(shortcut);
  expect(shortcut.querySelector("kbd")?.textContent).toBe("Ctrl K");
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
