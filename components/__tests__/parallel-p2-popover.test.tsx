// @vitest-environment jsdom
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import userEvent from "@testing-library/user-event";
import { act, createRef, useRef, useState } from "react";
import { expect, it, vi } from "vitest";
import { render } from "./helpers/dom";
const byName = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === name)!;
const click = async (node: Element) => act(async () => { await userEvent.setup().click(node); });
function Host() {
  const [open, setOpen] = useState(false); const anchor = useRef<HTMLButtonElement>(null);
  return <><Button ref={anchor} aria-controls={open ? "tree" : undefined} aria-expanded={open} onClick={() => setOpen(value => !value)}>Tree</Button><Button>Outside</Button><Popover id="tree" aria-label="Sources" open={open} onOpenChange={setOpen} anchor={anchor}><Button>First</Button><Button aria-current="true">Selected</Button></Popover></>;
}

it("portals, focuses the selected item, and toggling an open external trigger stays closed", async () => {
  const {container} = await render(<Host/>); await click(byName("Tree"));
  expect(document.querySelector("#tree")?.getAttribute("aria-label")).toBe("Sources"); expect(document.querySelector("#tree")?.getAttribute("role")).toBe("dialog"); expect(container.querySelector("#tree")).toBeNull();
  expect(document.activeElement).toBe(byName("Selected"));
  await click(byName("Tree"));
  await vi.waitFor(() => expect(document.querySelector("#tree")).toBeNull());
  expect(byName("Tree").getAttribute("aria-expanded")).toBe("false");
});

it("outside pointer closes without stealing focus from the clicked target", async () => {
  await render(<Host/>); await click(byName("Tree")); await click(byName("Outside"));
  await vi.waitFor(() => expect(document.querySelector("#tree")).toBeNull());
  expect(document.activeElement).toBe(byName("Outside"));
});

it("Escape closes and returns to the external trigger, then reopening focuses inside", async () => {
  await render(<Host/>); await click(byName("Tree"));
  await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
  await vi.waitFor(() => expect(document.activeElement).toBe(byName("Tree")));
  expect(document.querySelector("#tree")).toBeNull(); await click(byName("Tree"));
  expect(document.activeElement).toBe(byName("Selected"));
});

it("real KeyList forwards the external tree anchor without changing row selection", async () => {
  const { KeyList } = await import("@/components/translations/workspace/key-list");
  const { props } = await import("./helpers/workspace-props");
  const { startListGeneration } = await import("@/lib/translations/saved-rows");
  const anchor = createRef<HTMLButtonElement>();
  const fixture = props(); const select = vi.fn();
  const view = await render(<KeyList list={startListGeneration(fixture.list.rows, 1)} title="Keys" count={fixture.list.rows.length} savedExtra={0} selectedKeyId={undefined} showSource onSelect={select} empty={null} treeButton={{open: true, controls: "tree", ref: anchor, onToggle: () => {}, breadcrumb: "Sources"}} />);
  expect(anchor.current).toBe(view.container.querySelector('button[aria-controls="tree"]'));
  expect(anchor.current).not.toBeNull();
  expect(anchor.current?.getAttribute("aria-haspopup")).toBe("dialog");
  await act(async () => view.container.querySelector<HTMLButtonElement>("[data-key-row]")!.click());
  expect(select).toHaveBeenCalledOnce();
});
