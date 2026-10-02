// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act, createRef, useState } from "react";
import { expect, it, vi } from "vitest";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldTrigger } from "@/components/ui/field-trigger";
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
  expect(display.classList.contains("aria-[invalid=true]:focus-visible:border-destructive")).toBe(true);
  expect(display.classList.contains("aria-[invalid=true]:focus-visible:ring-destructive")).toBe(true);
  expect(find(container, "textarea").className).not.toContain("read-only:bg-muted");
});

it.each([["md", "h-9"], ["sm", "h-7"]] as const)("FieldTrigger %s owns shape and a single asChild element", async (size, height) => {
  const ref = createRef<HTMLButtonElement>();
  const { container } = await render(<FieldTrigger asChild active size={size} width={160} aria-disabled data-state="open" ref={ref}><button><span>Filter</span></button></FieldTrigger>);
  const button = find<HTMLButtonElement>(container, "button");
  expect(container.querySelectorAll("button")).toHaveLength(1);
  expect(ref.current).toBe(button);
  expect(button.classList.contains(height)).toBe(true);
  expect(button.classList.contains("border-foreground")).toBe(true);
  expect(button.classList.contains("aria-disabled:bg-accent")).toBe(true);
  expect(button.querySelector("svg")?.className.baseVal).toContain("group-data-[state=open]:rotate-180");
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

it("SelectTrigger shares FieldTrigger size and preserves native aria-disabled", async () => {
  const { Select, SelectTrigger, SelectValue } = await import("@/components/ui/select");
  const { container } = await render(<Select value="fixture"><SelectTrigger size="sm" width={160} aria-disabled aria-label="Choice"><SelectValue /></SelectTrigger></Select>);
  const trigger = find(container, '[role="combobox"]');
  expect(trigger.classList.contains("h-7")).toBe(true);
  expect(trigger.classList.contains("w-40")).toBe(true);
  expect(trigger.classList.contains("aria-disabled:bg-accent")).toBe(true);
  expect(trigger.getAttribute("aria-disabled")).toBe("true");
});

it("small FieldTrigger retains the actual translation filter spacing and inherited chevron color", async () => {
  const { container } = await render(<FieldTrigger size="sm" active={false}>Incomplete</FieldTrigger>);
  const trigger = find(container, "button");
  expect(trigger.classList.contains("px-2")).toBe(true);
  expect(trigger.classList.contains("gap-1.5")).toBe(true);
  expect(trigger.classList.contains("text-muted-foreground")).toBe(true);
  expect(find(container, "svg").classList.contains("size-3.5")).toBe(true);
  expect(find(container, "svg").classList.contains("text-muted-foreground")).toBe(false);
});

it("SelectTrigger asChild forwards pending pointer, click and keyboard guards before Radix opening", async () => {
  const { Select, SelectTrigger } = await import("@/components/ui/select");
  const opening = vi.fn();
  const pointer = vi.fn();
  const click = vi.fn();
  const keyboard = vi.fn();
  const ref = createRef<HTMLButtonElement>();
  const fixture = (pending: boolean) => <Select onOpenChange={opening}><SelectTrigger asChild ref={ref} aria-disabled={pending}
    onPointerDown={event => { pointer(); if (pending) event.preventDefault(); }}
    onClick={event => { click(); if (pending) event.preventDefault(); }}
    onKeyDown={event => { keyboard(); if (pending) event.preventDefault(); }}>
    <button aria-label="Guarded choice">Fixture</button>
  </SelectTrigger></Select>;
  const { container, rerender } = await render(fixture(true));
  const button = find<HTMLButtonElement>(container, '[role="combobox"]');
  expect(ref.current).toBe(button);
  expect(container.querySelectorAll("button")).toHaveLength(1);
  const user = userEvent.setup();
  await act(async () => { await user.click(button); });
  await act(async () => button.focus());
  await act(async () => { await user.keyboard("{Enter}{ArrowDown}"); });
  expect(pointer).toHaveBeenCalled();
  expect(click).toHaveBeenCalled();
  expect(keyboard).toHaveBeenCalledTimes(2);
  expect(opening).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button);
  await rerender(fixture(false));
  await act(async () => { await user.keyboard("{ArrowDown}"); });
  expect(opening).toHaveBeenCalledExactlyOnceWith(true);
});


it("invalid actual SelectTrigger keeps destructive border and ring when focused", async () => {
  const { Select, SelectTrigger } = await import("@/components/ui/select");
  const { container } = await render(<Select><SelectTrigger aria-invalid aria-label="Base branch">main</SelectTrigger></Select>);
  const trigger = find<HTMLButtonElement>(container, '[role="combobox"]');
  await act(async () => trigger.focus());
  expect(document.activeElement).toBe(trigger);
  expect(trigger.classList.contains("aria-[invalid=true]:focus-visible:border-destructive")).toBe(true);
  expect(trigger.classList.contains("aria-[invalid=true]:focus-visible:ring-destructive")).toBe(true);
});
