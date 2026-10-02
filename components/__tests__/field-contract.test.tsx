// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act, createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { find, render } from "./helpers/dom";

describe("field primitives before the API rename", () => {
  it.each(["input", "textarea"] as const)("%s forwards native identity, ref and invalid/help semantics", async (kind) => {
    const inputRef = createRef<HTMLInputElement>();
    const textareaRef = createRef<HTMLTextAreaElement>();
    const props = { id: "translation", name: "translation", "aria-label": "Translation", "aria-describedby": "help", "aria-invalid": true, "data-field": "value", defaultValue: "Hello" } as const;
    const { container } = await render(<>
      {kind === "input" ? <Input {...props} ref={inputRef} /> : <Textarea {...props} ref={textareaRef} />}
      <p id="help">Check the source</p>
    </>);
    const field = find<HTMLInputElement | HTMLTextAreaElement>(container, kind);
    expect(kind === "input" ? inputRef.current : textareaRef.current).toBe(field);
    expect(field.id).toBe("translation");
    expect(field.name).toBe("translation");
    expect(field.value).toBe("Hello");
    expect(field.getAttribute("aria-label")).toBe("Translation");
    expect(document.getElementById(field.getAttribute("aria-describedby")!)?.textContent).toBe("Check the source");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.dataset.field).toBe("value");
    for (const token of ["border-input", "border", "rounded-md", "px-2.5", "text-sm", "aria-[invalid=true]:border-destructive", "focus-visible:ring-ring", "focus-visible:ring-1", "focus-visible:outline-none"]) {
      expect(field.classList.contains(token), token).toBe(true);
    }
  });

  it.each(["input", "textarea"] as const)("%s edits when enabled and keeps readOnly distinct from disabled", async (kind) => {
    const changed = vi.fn();
    const view = await render(kind === "input" ? <Input onChange={changed} defaultValue="" /> : <Textarea onChange={changed} defaultValue="" />);
    const field = find<HTMLInputElement | HTMLTextAreaElement>(view.container, kind);
    const user = userEvent.setup();
    await act(async () => { await user.type(field, "Hi"); });
    expect(field.value).toBe("Hi");
    expect(changed).toHaveBeenCalled();
    changed.mockClear();
    await view.rerender(kind === "input" ? <Input readOnly onChange={changed} /> : <Textarea readOnly onChange={changed} />);
    expect(field.readOnly).toBe(true);
    expect(field.disabled).toBe(false);
    field.focus();
    expect(document.activeElement).toBe(field);
    await act(async () => { await user.type(field, " blocked"); });
    expect(field.value).toBe("Hi");
    expect(changed).not.toHaveBeenCalled();
    await view.rerender(kind === "input" ? <Input disabled onChange={changed} /> : <Textarea disabled onChange={changed} />);
    expect(field.disabled).toBe(true);
    expect(field.classList.contains("disabled:bg-muted")).toBe(true);
    expect(field.classList.contains("disabled:cursor-not-allowed")).toBe(true);
    await act(async () => { await user.type(field, " blocked"); });
    expect(changed).not.toHaveBeenCalled();
  });

  it("Input has the existing 36px scale and uses width API without changing caller height/font", async () => {
    const view = await render(<Input type="search" />);
    const field = find<HTMLInputElement>(view.container, "input");
    expect(field.type).toBe("search");
    expect(field.classList.contains("h-9")).toBe(true);
    await view.rerender(<Input type="search" width={160} className="h-8 text-xs" />);
    expect(field.classList.contains("h-9")).toBe(false);
    for (const token of ["h-8", "w-40", "text-xs"]) expect(field.classList.contains(token)).toBe(true);
    expect(field.classList.contains("text-sm")).toBe(false);
  });

  it("Textarea defaults to one content-sized row and preserves a caller row count", async () => {
    const view = await render(<Textarea />);
    const field = find<HTMLTextAreaElement>(view.container, "textarea");
    expect(field.rows).toBe(1);
    for (const token of ["field-sizing-content", "resize-none", "py-1"]) expect(field.classList.contains(token)).toBe(true);
    expect(field.classList.contains("h-9")).toBe(false);
    await view.rerender(<Textarea rows={4} className="py-2" />);
    expect(field.rows).toBe(4);
    expect(field.classList.contains("py-1")).toBe(false);
    expect(field.classList.contains("py-2")).toBe(true);
  });
});
