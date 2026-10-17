// @vitest-environment jsdom
import { act, useState } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { Combobox, type ComboboxGroup } from "@/components/ui/combobox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { key, render } from "./helpers/dom";

/**
 * **입력 + 목록 콤보박스** (locale-add E1 — 시안 A1의 프리셋 칸이 첫 소비자). `Command`는 ⌘K 이동 전용(행이 링크)이라 폼 값을 고르는
 * 이 형을 따로 둔다. ARIA는 combobox + listbox, 포커스는 늘 입력에 남고 활성 행은 `aria-activedescendant`가 가리킨다.
 */
const groups: ComboboxGroup[] = [
  { heading: "Previously", options: [{ value: "es", label: "es Spanish" }] },
  { heading: "Common", options: [{ value: "de", label: "de German" }, { value: "ja", label: "ja Japanese", disabled: true, aside: "Added" }, { value: "fr", label: "fr French" }] },
];

function Harness({ onSelect, inDialog = false }: { onSelect: (value: string) => void; inDialog?: boolean }) {
  const [value, setValue] = useState("");
  const box = <Combobox id="code" value={value} onValueChange={setValue} onSelect={onSelect} groups={groups} placeholder="Choose or type" listLabel="Languages" />;
  return inDialog ? <Dialog open onOpenChange={() => {}}><DialogContent title="Add">{box}</DialogContent></Dialog> : box;
}
const input = () => document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]');
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
const active = () => document.getElementById(input().getAttribute("aria-activedescendant") ?? "");

it("입력에 포커스하면 목록이 열리고 포커스는 입력에 남는다 — combobox·listbox·activedescendant", async () => {
  await render(<Harness onSelect={() => {}} />);
  await act(async () => { input().focus(); });
  expect(input().getAttribute("aria-expanded")).toBe("true");
  expect(input().getAttribute("aria-autocomplete")).toBe("list");
  expect(listbox()).not.toBeNull();
  expect(input().getAttribute("aria-controls")).toBe(listbox()!.id);
  expect(document.activeElement).toBe(input());
  expect(options().map(option => option.textContent)).toEqual(["es Spanish", "de German", "ja JapaneseAdded", "fr French"]);
  // 첫 활성은 첫 행이다.
  expect(active()?.textContent).toBe("es Spanish");
  expect(active()?.getAttribute("aria-selected")).toBe("true");
  // 그룹 머리는 option이 아니다.
  expect(listbox()!.querySelectorAll('[role="group"]').length).toBe(2);
});

it("↑↓는 꺼진 행을 건너뛰고 Enter가 활성 행을 고른다", async () => {
  const onSelect = vi.fn();
  await render(<Harness onSelect={onSelect} />);
  await act(async () => { input().focus(); });
  await key(input(), "ArrowDown");
  expect(active()?.textContent).toBe("de German");
  await key(input(), "ArrowDown");
  expect(active()?.textContent).toBe("fr French");
  expect(options()[2]!.getAttribute("aria-disabled")).toBe("true");
  await key(input(), "Enter");
  expect(onSelect).toHaveBeenCalledWith("fr");
  expect(input().getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(input());
});

it("IME 조합 중 Enter는 고르지 않는다", async () => {
  const onSelect = vi.fn();
  await render(<Harness onSelect={onSelect} />);
  await act(async () => { input().focus(); });
  await act(async () => { input().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); });
  await key(input(), "Enter", { isComposing: true });
  expect(onSelect).not.toHaveBeenCalled();
  await act(async () => { input().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })); });
  await key(input(), "Enter");
  expect(onSelect).toHaveBeenCalledWith("es");
});

it("행을 누르면 고르고 포커스는 입력에 남는다 — 꺼진 행은 아무 일도 없다", async () => {
  const onSelect = vi.fn();
  await render(<Harness onSelect={onSelect} />);
  const user = userEvent.setup();
  await act(async () => { await user.click(input()); });
  await act(async () => { await user.click(options()[2]!); });
  expect(onSelect).not.toHaveBeenCalled();
  await act(async () => { await user.click(options()[1]!); });
  expect(onSelect).toHaveBeenCalledWith("de");
  expect(document.activeElement).toBe(input());
});

it("열린 목록의 Esc는 목록만 닫고 Dialog는 남는다", async () => {
  await render(<Harness onSelect={() => {}} inDialog />);
  await act(async () => { input().focus(); });
  expect(listbox()).not.toBeNull();
  await key(input(), "Escape");
  expect(input().getAttribute("aria-expanded")).toBe("false");
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});

it("치면 목록이 다시 열리고 활성은 첫 행으로 돌아간다", async () => {
  await render(<Harness onSelect={() => {}} />);
  const user = userEvent.setup();
  await act(async () => { input().focus(); });
  await key(input(), "Escape");
  await act(async () => { await user.type(input(), "d"); });
  expect(input().value).toBe("d");
  expect(input().getAttribute("aria-expanded")).toBe("true");
  expect(active()?.textContent).toBe("es Spanish");
});
