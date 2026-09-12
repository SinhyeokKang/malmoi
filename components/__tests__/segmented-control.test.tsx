// @vitest-environment jsdom
import { act, useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { find, key, render } from "./helpers/dom";

const options = [
  { value: "general", label: "General" },
  { value: "changes", label: "Changes" },
  { value: "history", label: "History" },
];

async function setup(initial = "general") {
  const onChange = vi.fn();
  function View() {
    const [value, setValue] = useState(initial);
    return <><SegmentedControl label="View" value={value} options={options} onChange={(next) => { setValue(next); onChange(next); }} /><a href="#after">After</a></>;
  }
  const { container } = await render(<View />);
  const user = userEvent.setup();
  await act(async () => user.tab());
  const expectSelected = (value: string) => {
    const selected = find<HTMLButtonElement>(container, '[role="radio"][aria-checked="true"]');
    expect(selected.textContent).toBe(options.find((option) => option.value === value)?.label);
    expect(document.activeElement).toBe(selected);
  };
  const press = async (keys: string) => {
    const held = /^\{(Arrow\w+)\}$/.exec(keys)?.[1];
    await act(async () => {
      await user.keyboard(held ? `{${held}>}` : keys);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (held) await act(async () => user.keyboard(`{/${held}}`));
  };
  return { container, user, press, expectSelected, onChange };
}

describe("SegmentedControl — rendered keyboard behavior", () => {
  it("Tab enters the selected option once and exits the group", async () => {
    const { container, user, expectSelected, onChange } = await setup("changes");
    expectSelected("changes");
    expect([...container.querySelectorAll('[role="radio"]')].map((item) => item.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    await act(async () => user.tab());
    expect(document.activeElement).toBe(container.querySelector("a"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(["ArrowRight", "ArrowDown"])("%s selects and focuses the next option, wrapping at the end", async (arrow) => {
    const { press, expectSelected } = await setup();
    for (const value of ["changes", "history", "general"]) {
      await press(`{${arrow}}`);
      expectSelected(value);
    }
  });

  it.each(["ArrowLeft", "ArrowUp"])("%s selects and focuses the previous option, wrapping at the start", async (arrow) => {
    const { press, expectSelected } = await setup();
    for (const value of ["history", "changes", "general"]) {
      await press(`{${arrow}}`);
      expectSelected(value);
    }
  });

  it("Home and End select and focus the first and last options", async () => {
    const { press, expectSelected } = await setup("changes");
    await press("{End}");
    expectSelected("history");
    await press("{Home}");
    expectSelected("general");
  });

  it("letters preserve the selection and arrow keys prevent scrolling", async () => {
    const { press, expectSelected, onChange } = await setup();
    await press("a");
    expectSelected("general");
    expect(onChange).not.toHaveBeenCalled();
    const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    await act(async () => { document.activeElement?.dispatchEvent(event); await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(event.defaultPrevented).toBe(true);
  });

  it("an empty group has no interactive options and ignores navigation", async () => {
    const onChange = vi.fn();
    const { container } = await render(<SegmentedControl label="View" value="" options={[]} onChange={onChange} />);
    const group = find(container, '[role="radiogroup"]');
    await key(group, "ArrowRight");
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});
