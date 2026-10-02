// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";

import { act, createRef, useState } from "react";

import { expect, it, vi } from "vitest";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

import { Textarea } from "@/components/ui/textarea";



import { SearchInput } from "@/components/ui/search-input";

import { render, find, key } from "./helpers/dom";

it.each([["md", "h-9"], ["sm", "h-8"], ["xs", "h-7"]] as const)("Input %s keeps height, ref, native props and width on the input", async (size, height) => {
  const ref = createRef<HTMLInputElement>();
  const { container } = await render(<Input ref={ref} size={size} width={192} icon={<Search />} aria-label="Find" data-field="fixture" />);
  const field = find<HTMLInputElement>(container, "input");
  expect(ref.current).toBe(field);
  expect(field.classList.contains(height)).toBe(true);
  expect(field.classList.contains("w-48")).toBe(true);
  expect(field.getAttribute("data-field")).toBe("fixture");
  expect(container.querySelector("svg")?.parentElement?.getAttribute("aria-hidden")).toBe("true");
});

it("clearable immediate Input emits one empty change and restores field focus", async () => {
  const change = vi.fn();
  function Fixture() {
    const [value, setValue] = useState("fixture");
    return <Input value={value} clearable aria-label="Filter" onChange={event => { change(event.target.value); setValue(event.target.value); }} />;
  }
  const { container } = await render(<Fixture />);
  await userEvent.setup().click(find(container, 'button[aria-label="Clear search"]'));
  expect(change).toHaveBeenCalledExactlyOnceWith("");
  expect(find<HTMLInputElement>(container, "input").value).toBe("");
  expect(document.activeElement).toBe(container.querySelector("input"));
  expect(container.querySelector("button")).toBeNull();
});

it("bare has no border or ring; readonly gets display colors while Textarea stays a transition lock", async () => {
  const { container } = await render(<><Input variant="bare" size="sm" /><Input readOnly value="fixture" aria-invalid /><Textarea readOnly value="fixture" /></>);
  const bare = find<HTMLInputElement>(container, "input");
  const display = container.querySelectorAll("input")[1]!;
  expect(bare.classList.contains("border-0")).toBe(true);
  expect(bare.classList.contains("focus-visible:ring-0")).toBe(true);
  expect(display.classList.contains("read-only:bg-muted")).toBe(true);
  expect(display.classList.contains("read-only:text-foreground")).toBe(true);
  expect(find(container, "textarea").className).not.toContain("read-only:bg-muted");
});

it("SearchInput X and nonempty Escape submit empty exactly once; empty Escape bubbles", async () => {
  const search = vi.fn();
  const outer = vi.fn();
  const { container, rerender } = await render(<div onKeyDown={outer}><SearchInput value="fixture" label="Find" onSearch={search} /></div>);
  const field = find<HTMLInputElement>(container, "input");
  await key(field, "Escape");
  expect(search).toHaveBeenCalledExactlyOnceWith("");
  expect(outer).not.toHaveBeenCalled();
  expect(field.value).toBe("");
  await key(field, "Escape");
  expect(outer).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenCalledTimes(1);
  await rerender(<div onKeyDown={outer}><SearchInput value="next" label="Find" onSearch={search} /></div>);
  await userEvent.setup().click(find(container, 'button[aria-label="Clear search"]'));
  expect(search).toHaveBeenCalledTimes(2);
  expect(field.value).toBe("");
});

it("both IME guards leave Escape and Enter untouched; submitted response preserves later drafting", async () => {
  const search = vi.fn();
  const { container, rerender } = await render(<SearchInput value="fixture" label="Find" onSearch={search} width={320} />);
  const field = find<HTMLInputElement>(container, "input");
  for (const guard of [{ isComposing: true }, { keyCode: 229 }]) for (const code of ["Escape", "Enter"]) await key(field, code, guard);
  expect(search).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.clear(field);
  await user.type(field, " ab{Enter}c");
  await rerender(<SearchInput value="ab" label="Find" onSearch={search} width={320} />);
  expect(field.value).toBe(" abc");
  expect(field.classList.contains("w-80")).toBe(true);
  expect(search).toHaveBeenCalledExactlyOnceWith("ab");
});
