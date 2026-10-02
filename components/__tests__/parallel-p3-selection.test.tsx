// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act, useState } from "react";
import { expect, it, vi } from "vitest";
import { SelectRow } from "@/components/ui/select-row";
import { RadioGroup } from "@/components/ui/radio";
import { Button } from "@/components/ui/button";
import { render, find, key } from "./helpers/dom";

it("radio roving preserves list semantics and expands selected content without nesting aside actions in labels", async () => {
  function Fixture() {
    const [selected, setSelected] = useState("first");
    return <RadioGroup value={selected} onValueChange={setSelected} aria-label="Choice"><ul>
      {["first", "second"].map((value, index) => <li key={value}><SelectRow input="radio" value={value} checked={selected === value} first={index === 0} previousChecked={selected === "first" && index === 1} label={value} expand={selected === value ? <span data-expand>{value} details</span> : undefined} /></li>)}
    </ul></RadioGroup>;
  }
  const { container } = await render(<Fixture />);
  const user = userEvent.setup();
  await act(async () => { await user.click(find(container, '[role="radio"][value="first"]')); });
  await key(document.activeElement!, "ArrowDown");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  expect(find(container, '[role="radio"][value="second"]').getAttribute("aria-checked")).toBe("true");
  expect(find(container, "ul").getAttribute("role")).toBeNull();
  expect(find(container, "[data-expand]").textContent).toBe("second details");
});

it("checkbox multi-select toggles once per label click; preview aside remains independent", async () => {
  const change = vi.fn();
  const preview = vi.fn();
  function Fixture() {
    const [checked, setChecked] = useState(false);
    return <SelectRow input="checkbox" checked={checked} onCheckedChange={on => { setChecked(on === true); change(on); }} label="Include fixture" aside={<Button onClick={preview}>Preview</Button>} />;
  }
  const { container } = await render(<Fixture />);
  const user = userEvent.setup();
  await user.click(find(container, "label"));
  expect(change).toHaveBeenCalledExactlyOnceWith(true);
  const aside = [...container.querySelectorAll("button")].find(button => button.textContent === "Preview")!;
  expect(aside.closest("label")).toBeNull();
  await user.click(aside);
  expect(preview).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledTimes(1);
});

it("disabled choice does not toggle and read-only aria-disabled radio still exposes its reason", async () => {
  const change = vi.fn();
  const { container } = await render(<RadioGroup aria-label="Scope"><SelectRow input="radio" value="fixture" checked={false} aria-disabled aria-describedby="reason" label={<><span>Chosen projects</span><span id="reason">No projects</span></>} onClick={change} /></RadioGroup>);
  const radio = find<HTMLButtonElement>(container, '[role="radio"]');
  expect(radio.disabled).toBe(false);
  expect(radio.getAttribute("aria-disabled")).toBe("true");
  expect(radio.getAttribute("aria-describedby")).toBe("reason");
  expect(radio.classList.contains("aria-disabled:opacity-50")).toBe(true);
  expect(find(container, "label").classList.contains("cursor-not-allowed")).toBe(true);
  await userEvent.setup().click(find(container, "label"));
  expect(change).not.toHaveBeenCalled();
  expect(radio.getAttribute("aria-checked")).toBe("false");
});

it("file preview aside preserves 12px vertical row padding without stretching its checkbox hit area", async () => {
  const { container } = await render(<SelectRow input="checkbox" checked={false} label={<span className="sr-only">Include fixture</span>} aside={<Button><span className="size-10">Fixture file</span></Button>} />);
  const label = find(container, "label");
  const preview = [...container.querySelectorAll("button")].find(button => button.textContent === "Fixture file")!;
  expect(label.classList.contains("flex-1")).toBe(false);
  expect(preview.parentElement?.classList.contains("py-3")).toBe(true);
  expect(preview.classList.contains("h-auto")).toBe(true);
  expect(preview.classList.contains("p-0")).toBe(true);
  expect(preview.classList.contains("h-9")).toBe(false);
  expect(preview.closest("label")).toBeNull();
});
