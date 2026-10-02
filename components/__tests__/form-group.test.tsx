// @vitest-environment jsdom
import { createRef, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { find, input, render } from "./helpers/dom";

it("connects only the rendered description while retaining ordered external IDs, ref and events", async () => {
  const ref = createRef<HTMLInputElement>();
  const onChange = vi.fn();
  const view = (error?: ReactNode, help?: ReactNode, disabled = false) => <>
    <p id="external">External</p><p id="second">Second</p>
    <FormGroup label="Name" htmlFor="name" error={error} help={help}>
      {(describe) => <Input id="name" ref={ref} disabled={disabled} onChange={onChange} aria-invalid={error !== undefined ? true : undefined} aria-describedby={describe(" external\tname-error external second\nname-help second ")} />}
    </FormGroup>
  </>;
  const { container, rerender } = await render(view(undefined, "Hint"));
  const field = find<HTMLInputElement>(container, "input");
  expect(ref.current).toBe(field);
  expect(container.querySelector("label")?.htmlFor).toBe(field.id);
  expect(field.getAttribute("aria-describedby")).toBe("external second name-help");
  await input(field, "Ada");
  expect(onChange).toHaveBeenCalledOnce();
  for (const error of ["Required", null, false]) {
    await rerender(view(error, "Hint"));
    expect(ref.current).toBe(field);
    expect(field.getAttribute("aria-describedby")).toBe("external name-error second");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector("#name-help")).toBeNull();
    expect(container.querySelector("#name-error")?.getAttribute("role")).toBe("alert");
    expect(container.querySelector("#name-error svg")?.getAttribute("aria-hidden")).toBe("true");
  }
  await rerender(view(undefined, "Restored", true));
  expect(field.getAttribute("aria-describedby")).toBe("external second name-help");
  expect(field.getAttribute("aria-invalid")).toBeNull();
  expect(field.disabled).toBe(true);
  expect(ref.current).toBe(field);
  await rerender(view());
  expect(field.getAttribute("aria-describedby")).toBe("external second");
  expect(container.querySelector("#name-help, #name-error")).toBeNull();
});

it("returns no description when absent, including stale own tokens, and keeps defined empty help", async () => {
  const view = (help?: ReactNode) => <FormGroup label="Path" htmlFor="path" help={help}>
    {(describe) => <Input id="path" aria-describedby={describe("path-help path-error")} />}
  </FormGroup>;
  const { container, rerender } = await render(view());
  const field = find(container, "input");
  expect(field.hasAttribute("aria-describedby")).toBe(false);
  for (const help of [null, false]) {
    await rerender(view(help));
    expect(field.getAttribute("aria-describedby")).toBe("path-help");
    expect(container.querySelector("#path-help")).not.toBeNull();
  }
});

it("keeps distinct generated IDs stable across Input and actual Radix SelectTrigger transitions", async () => {
  const view = (error?: ReactNode) => <>
    <FormGroup label="Input" help="Input hint" error={error}>
      {(describe) => <Input aria-describedby={describe()} />}
    </FormGroup>
    <FormGroup label="Locale" labelId="locale-label" help="Locale hint" error={error}>
      {(describe) => <Select value="en"><SelectTrigger id="locale" aria-labelledby="locale-label locale" aria-describedby={describe()}><SelectValue /></SelectTrigger></Select>}
    </FormGroup>
  </>;
  const { container, rerender } = await render(view());
  const controls = [find(container, "input"), find(container, '[role="combobox"]')];
  const ids = controls.map(control => control.getAttribute("aria-describedby")!);
  expect(new Set(ids).size).toBe(2);
  for (const id of ids) expect(document.getElementById(id)?.textContent).toMatch(/hint/);
  expect(controls[1]!.getAttribute("aria-labelledby")).toBe("locale-label locale");
  for (const error of [false, undefined]) {
    await rerender(view(error));
    controls.forEach((control, index) => {
      const id = error === undefined ? ids[index]! : ids[index]!.replace(/-help$/, "-error");
      expect(control.getAttribute("aria-describedby")).toBe(id);
      expect(document.getElementById(id)).not.toBeNull();
    });
  }
});
