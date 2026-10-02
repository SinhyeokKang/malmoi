// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, useState, type ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { CommandDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LargeModal, LARGE_MODAL_HEIGHT, LARGE_MODAL_OVERLAY, LARGE_MODAL_PANEL } from "@/components/ui/large-modal";
import { cn } from "@/lib/utils";

import { find, render } from "./helpers/dom";

// jsdom의 disabled focus fixup을 보충한다 — 꺼진 연 자리로 복귀한 것으로 오판하지 않는다.
let fixup: MutationObserver;
beforeEach(() => {
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    active.removeAttribute("disabled");
    active.blur();
    active.setAttribute("disabled", "");
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
});
afterEach(() => fixup.disconnect());

async function click(node: Element) { await act(async () => { await userEvent.setup().click(node); }); }
function Host({ onCloseAutoFocus, onEscapeKeyDown, autoFocus = false }: Pick<ComponentProps<typeof CommandDialog>, "onCloseAutoFocus" | "onEscapeKeyDown"> & { autoFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Input aria-label="Earlier" />
    <Button onClick={() => setOpen(true)}>Open search</Button>
    <CommandDialog open={open} onOpenChange={setOpen} title="Search" onCloseAutoFocus={onCloseAutoFocus} onEscapeKeyDown={onEscapeKeyDown}>
      <Input aria-label="First" autoFocus={autoFocus} />
      <Input aria-label="Search query" data-initial-focus />
    </CommandDialog>
  </>;
}
const query = () => find<HTMLInputElement>(document.body, '[aria-label="Search query"]');
const opener = () => find<HTMLButtonElement>(document.body, "button");

it("첫 입력 대신 표식 입력에 포커스하고 Esc로 닫으면 연 자리로 돌아온다", async () => {
  await render(<Host />);
  await click(opener());
  expect(document.activeElement).toBe(query());
  await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(opener()));
});

it("이미 autoFocus한 입력의 포커스를 표식이 빼앗지 않는다", async () => {
  await render(<Host autoFocus />);
  await click(opener());
  expect(document.activeElement).toBe(document.querySelector('[aria-label="First"]'));
});

it("포커스를 주지 않는 포인터 클릭도 연 버튼으로 돌아온다", async () => {
  await render(<Host />);
  find<HTMLInputElement>(document.body, '[aria-label="Earlier"]').focus();
  await act(async () => {
    opener().dispatchEvent(new Event("pointerdown", { bubbles: true }));
    opener().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(document.activeElement).toBe(query());
  await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
  await vi.waitFor(() => expect(document.activeElement).toBe(opener()));
});

it("단축키로 열어도 연 컨트롤에 돌아오고 Tab 트랩은 패널 안이다", async () => {
  function ShortcutHost() {
    const [open, setOpen] = useState(false);
    return <>
      <Button onKeyDown={event => { if (event.key === "k") setOpen(true); }}>Shortcut origin</Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search"><Input aria-label="Search query" data-initial-focus /></CommandDialog>
    </>;
  }
  await render(<ShortcutHost />);
  opener().focus();
  await act(async () => { await userEvent.setup().keyboard("k{Tab}{Shift>}{Tab}{/Shift}"); });
  expect(document.activeElement).toBe(query());
  await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
  await vi.waitFor(() => expect(document.activeElement).toBe(opener()));
});

it("호출부의 닫힘 포커스 지정이 우선한다 — 같은 페이지 해시 착지", async () => {
  await render(<Host onCloseAutoFocus={event => { event.preventDefault(); find<HTMLInputElement>(document.body, '[aria-label="Earlier"]').focus(); }} />);
  await click(opener());
  await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
  await vi.waitFor(() => expect(document.activeElement).toBe(document.querySelector('[aria-label="Earlier"]')));
});

it("Esc를 소비한 호출부는 닫지 않는다 — IME 취소의 경계", async () => {
  const onOpenChange = vi.fn();
  await render(<CommandDialog open onOpenChange={onOpenChange} title="Search" onEscapeKeyDown={event => event.preventDefault()}><Input aria-label="Search query" data-initial-focus /></CommandDialog>);
  await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(onOpenChange).not.toHaveBeenCalled();
});

it("오버레이를 누르면 닫히고 연 자리로 돌아온다", async () => {
  await render(<Host />);
  await click(opener());
  const dialog = find<HTMLElement>(document.body, '[role="dialog"]');
  await act(async () => { dialog.previousElementSibling!.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(opener()));
});

it("대형 모달 면·높이·dim을 공유하고 위치만 top-4로 바꾼다", async () => {
  const view = await render(<LargeModal open onClose={() => {}} title="Large" actions={<Button>Done</Button>}><Input aria-label="Large input" /></LargeModal>);
  const large = find<HTMLElement>(document.body, '[role="dialog"]');
  expect(large.className).toBe(cn(LARGE_MODAL_PANEL, LARGE_MODAL_HEIGHT));
  const originalHeight = [...large.classList].filter(token => /^(?:min|max)-h-/.test(token));
  await view.rerender(<CommandDialog open onOpenChange={() => {}} title="Search"><Input aria-label="Search query" data-initial-focus /></CommandDialog>);
  const dialog = find<HTMLElement>(document.body, '[role="dialog"]');
  expect(dialog.className).toBe(cn(LARGE_MODAL_PANEL, LARGE_MODAL_HEIGHT, "top-4 translate-y-0"));
  expect([...dialog.classList].filter(token => /^(?:min|max)-h-/.test(token))).toEqual(originalHeight);
  expect(dialog.classList.contains("top-1/2")).toBe(false);
  expect(dialog.classList.contains("-translate-y-1/2")).toBe(false);
  expect(dialog.previousElementSibling?.className).toBe(LARGE_MODAL_OVERLAY);
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(dialog.getAttribute("aria-describedby")).toBeNull();
  const title = find<HTMLElement>(dialog, `#${dialog.getAttribute("aria-labelledby")}`.replaceAll(":", "\\:"));
  expect(title.textContent).toBe("Search");
  expect(title.className).toBe("sr-only");
  expect(dialog.querySelector("header, footer, button")).toBeNull();
  const source = readFileSync("components/ui/dialog.tsx", "utf8");
  expect(source).not.toMatch(/1024px|800px|80svh|backdrop-blur-\[6px\]/);
});
