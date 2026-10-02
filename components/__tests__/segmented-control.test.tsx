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

  /** 국기도 아이콘도 호출부의 ReactNode 슬롯이다 — 치수와 aria-hidden을 보존한다. */
  it("renders an icon node before the label", async () => {
    const { container } = await render(
      <SegmentedControl
        label="Language"
        value="ko"
        options={[{ value: "ko", label: "ko", icon: <span data-testid="flag" /> }]}
        onChange={vi.fn()}
      />,
    );

    const radio = find(container, '[role="radio"]');
    const flag = find(radio, '[data-testid="flag"]');
    expect(radio.firstElementChild).toBe(flag);
  });
});

it.each([0, 2])("icon node and count pair preserve glyph/label/badge order (%s)", async (count) => {
  const { container } = await render(<SegmentedControl label="View" value="all" options={[{ value: "all", label: "All", icon: <svg className="size-4 shrink-0" aria-hidden />, count, countLabel: `${count} keys` }]} onChange={vi.fn()} />);
  const radio = find(container, '[role="radio"]');
  expect(radio.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  expect(radio.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  expect(radio.children[1]?.className).toBe("min-w-0 truncate");
  expect(radio.children[1]?.textContent).toBe("All");
  expect(radio.children).toHaveLength(count === 0 ? 2 : 3);
  if (count) {
    expect(radio.lastElementChild?.classList.contains("shrink-0")).toBe(true);
    expect(radio.lastElementChild?.querySelector('[aria-hidden="true"]')?.textContent).toBe("2");
    expect(radio.lastElementChild?.querySelector(".sr-only")?.textContent).toBe("2 keys");
  }
});

it("segment count requires its accessible sentence", () => {
  // @ts-expect-error — countLabel must accompany count.
  const content: import("@/components/ui/segmented-control").SegmentContent = { label: "All", count: 2 };
  expect(content.count).toBe(2);
});

it("forwards native aria-describedby to the actual Radix group", async () => {
  const { container } = await render(<><p id="view-help">Choose a view</p><SegmentedControl label="View" value="general" options={options} onChange={vi.fn()} aria-describedby="view-help" /></>);
  const group = find(container, '[role="radiogroup"]');
  expect(group.getAttribute("aria-describedby")).toBe("view-help");
  expect(document.getElementById(group.getAttribute("aria-describedby")!)?.textContent).toBe("Choose a view");
  expect(group.getAttribute("aria-label")).toBe("View");
  expect(group.querySelector('[aria-checked="true"]')?.textContent).toBe("General");
});
