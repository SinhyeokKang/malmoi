// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act, createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { ListItemButton } from "@/components/ui/list-item";
import { Radio, RadioGroup } from "@/components/ui/radio";

import { find, key, render } from "./helpers/dom";

describe("Radio before the API rename", () => {
  it("keeps a named group, selected indicator and independent label/item classes", async () => {
    const { container } = await render(<RadioGroup aria-label="Repository" defaultValue="web">
      <Radio value="web" label={<span>Web</span>} labelClassName="gap-3" className="mt-1" />
      <Radio value="api" label="API" disabled />
    </RadioGroup>);
    const group = find(container, '[role="radiogroup"]');
    const [selected, disabled] = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(group.getAttribute("aria-label")).toBe("Repository");
    expect(selected?.getAttribute("aria-checked")).toBe("true");
    expect(selected?.getAttribute("data-state")).toBe("checked");
    expect(selected?.querySelector('[data-state="checked"]')?.classList.contains("size-2")).toBe(true);
    expect(selected?.closest("label")?.textContent).toBe("Web");
    expect(selected?.closest("label")?.classList.contains("gap-3")).toBe(true);
    expect(selected?.classList.contains("mt-1")).toBe(true);
    for (const token of ["size-4", "rounded-full", "border", "border-gray-light", "data-[state=checked]:border-foreground", "focus-visible:ring-2"]) expect(selected?.classList.contains(token), token).toBe(true);
    expect(disabled?.matches(":disabled")).toBe(true);
    expect(disabled?.getAttribute("aria-checked")).toBe("false");
    expect(disabled?.querySelector('[data-state="checked"]')).toBeNull();
  });

  it("label clicks and arrows change selection while skipping disabled items", async () => {
    const change = vi.fn();
    const { container } = await render(<RadioGroup aria-label="Repository" defaultValue="web" onValueChange={change}>
      <Radio value="web" label="Web" />
      <Radio value="blocked" label="Blocked" disabled />
      <Radio value="api" label="API" />
    </RadioGroup>);
    const radios = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const user = userEvent.setup();
    await act(async () => { await user.click(radios[2]!.closest("label")!); });
    expect(change).toHaveBeenLastCalledWith("api");
    expect(radios[2]?.getAttribute("aria-checked")).toBe("true");
    await act(async () => { radios[0]!.focus(); });
    // Radix가 타이머로 포커스를 옮기므로 keyup 전에 이동을 흘려야 화살표의 선택 동작도 관측된다.
    await key(radios[0]!, "ArrowDown");
    await act(async () => { await vi.waitFor(() => expect(document.activeElement).toBe(radios[2])); });
    expect(radios[1]?.getAttribute("aria-checked")).toBe("false");
    expect(change.mock.calls.every(([value]) => value !== "blocked")).toBe(true);
    await act(async () => { radios[2]!.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true })); });
    await key(radios[2]!, "ArrowUp");
    await act(async () => { await vi.waitFor(() => expect(document.activeElement).toBe(radios[0])); });
    expect(radios[0]?.getAttribute("aria-checked")).toBe("true");
    await act(async () => { radios[0]!.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true })); });
  });
});

describe("ListItemButton before the API rename", () => {
  it("defaults to a non-submitting full-width row with an inset focus ring", async () => {
    const ref = createRef<HTMLButtonElement>();
    const clicked = vi.fn();
    const view = await render(<ListItemButton ref={ref} id="key-row" data-key="greeting" onClick={clicked}>Greeting</ListItemButton>);
    const row = find<HTMLButtonElement>(view.container, "button");
    expect(ref.current).toBe(row);
    expect(row.type).toBe("button");
    expect(row.id).toBe("key-row");
    expect(row.dataset.key).toBe("greeting");
    expect(row.getAttribute("aria-current")).toBeNull();
    for (const token of ["w-full", "text-left", "focus-visible:ring-inset", "hover:bg-foreground/[0.03]"]) expect(row.classList.contains(token), token).toBe(true);
    await act(async () => { await userEvent.setup().click(row); });
    expect(clicked).toHaveBeenCalledTimes(1);
    await view.rerender(<ListItemButton selected type="submit" className="font-medium">Greeting</ListItemButton>);
    expect(row.type).toBe("submit");
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(row.classList.contains("bg-foreground/[0.07]")).toBe(true);
    expect(row.classList.contains("hover:bg-foreground/[0.03]")).toBe(false);
    expect(row.classList.contains("font-medium")).toBe(true);
  });

  it.each([false, true])("disabled selected=%s keeps its selection semantics and has no hover or click", async (selected) => {
    const clicked = vi.fn();
    const { container } = await render(<ListItemButton selected={selected} disabled onClick={clicked}>Empty namespace</ListItemButton>);
    const row = find<HTMLButtonElement>(container, "button");
    expect(row.disabled).toBe(true);
    expect(row.getAttribute("aria-current")).toBe(selected ? "true" : null);
    expect(row.classList.contains("bg-foreground/[0.07]")).toBe(selected);
    expect([...row.classList].some(token => token.startsWith("hover:"))).toBe(false);
    await act(async () => { await userEvent.setup().click(row); });
    expect(clicked).not.toHaveBeenCalled();
  });
});
