// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act, useRef, useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { CommandDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LargeModal } from "@/components/ui/large-modal";
import { Popover } from "@/components/ui/popover";

import { key, render } from "./helpers/dom";

/**
 * **조합 중 Esc는 조합 취소다 — 오버레이를 닫지 않는다** (search-ux-unify C9·D11). 소비자 코드 없이 프리미티브가 든다.
 * Radix는 Esc를 document capture에서 들어 입력의 `stopPropagation`이 안 닿으므로, 판정이 Content의 `onEscapeKeyDown`에 있어야 한다.
 * ⚠️ jsdom 합성 이벤트만으로 완료를 선언하지 않는다 — 실 IME 확인은 인계 (b) 목록에 있다(POSTMORTEM 2026-09-24).
 */
const field = () => document.querySelector<HTMLInputElement>('[aria-label="Field"]');
const Field = () => <input aria-label="Field" />;
const compose = async (type: "compositionstart" | "compositionend") => {
  await act(async () => { field()!.dispatchEvent(new CompositionEvent(type, { bubbles: true })); });
};

function Controlled({ children }: { children: (open: boolean, setOpen: (open: boolean) => void) => ReactNode }) {
  const [open, setOpen] = useState(true);
  return <>{children(open, setOpen)}</>;
}

const OVERLAYS: [string, () => ReactNode][] = [
  ["DialogContent", () => <Controlled>{(open, setOpen) => <Dialog open={open} onOpenChange={setOpen}><DialogContent title="Invite"><Field /></DialogContent></Dialog>}</Controlled>],
  ["CommandDialog", () => <Controlled>{(open, setOpen) => <CommandDialog open={open} onOpenChange={setOpen} title="Search"><Field /></CommandDialog>}</Controlled>],
  ["LargeModal", () => <Controlled>{(open, setOpen) => <LargeModal open={open} title="New project" onClose={() => setOpen(false)} actions={null}><Field /></LargeModal>}</Controlled>],
  ["Popover", () => <PopoverHost />],
  ["DropdownMenuContent", () => <Controlled>{(open, setOpen) => <DropdownMenu open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger asChild><Button>Menu</Button></DropdownMenuTrigger>
    <DropdownMenuContent><Field /></DropdownMenuContent>
  </DropdownMenu>}</Controlled>],
];

function PopoverHost() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return <>
    <Button ref={anchor} onClick={() => setOpen(value => !value)}>Anchor</Button>
    <Button>Outside</Button>
    <Popover id="pop" aria-label="Pop" open={open} onOpenChange={setOpen} anchor={anchor}><Field /></Popover>
  </>;
}

async function openAndFocus(ui: () => ReactNode, name: string) {
  await render(ui());
  if (name === "Popover") await act(async () => { await userEvent.setup().click(byName("Anchor")); });
  expect(field()).not.toBeNull();
  act(() => field()!.focus());
}
const byName = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === name)!;

describe.each(OVERLAYS)("%s", (name, ui) => {
  it("isComposing인 Esc는 닫지 않는다", async () => {
    await openAndFocus(ui, name);
    await key(field()!, "Escape", { isComposing: true });
    expect(field()).not.toBeNull();
  });

  it("keyCode 229인 Esc는 닫지 않는다 — Safari", async () => {
    await openAndFocus(ui, name);
    await key(field()!, "Escape", { keyCode: 229 });
    expect(field()).not.toBeNull();
  });

  it("compositionstart 직후 플래그 없는 Esc는 닫지 않고, compositionend 뒤 Esc는 닫는다", async () => {
    await openAndFocus(ui, name);
    await compose("compositionstart");
    await key(field()!, "Escape");
    expect(field()).not.toBeNull();
    await compose("compositionend");
    await key(field()!, "Escape");
    await vi.waitFor(() => expect(field()).toBeNull());
  });
});

describe("Popover — 조합 Esc가 복귀 표시를 남기지 않는다", () => {
  it("조합 Esc 뒤 바깥 클릭으로 닫히면 포커스가 앵커로 가지 않는다", async () => {
    await openAndFocus(() => <PopoverHost />, "Popover");
    await key(field()!, "Escape", { isComposing: true });
    expect(field()).not.toBeNull();
    await act(async () => { await userEvent.setup().click(byName("Outside")); });
    await vi.waitFor(() => expect(field()).toBeNull());
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(document.activeElement).toBe(byName("Outside"));
  });

  it("조합 Esc 뒤 일반 Esc 한 번에 닫히고 앵커로 돌아온다", async () => {
    await openAndFocus(() => <PopoverHost />, "Popover");
    await key(field()!, "Escape", { isComposing: true });
    await key(field()!, "Escape");
    await vi.waitFor(() => expect(field()).toBeNull());
    // FocusScope의 닫힘 복귀는 setTimeout 뒤다.
    await vi.waitFor(() => expect(document.activeElement).toBe(byName("Anchor")));
  });
});
