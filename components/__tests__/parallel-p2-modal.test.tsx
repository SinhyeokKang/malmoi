// @vitest-environment jsdom
import { Button } from "@/components/ui/button";
import { LARGE_MODAL_OVERLAY, LARGE_MODAL_PANEL, LargeModal } from "@/components/ui/large-modal";
import { WizardFooter } from "@/components/ui/wizard-footer";
import userEvent from "@testing-library/user-event";
import { act, useRef, useState } from "react";
import { expect, it, vi } from "vitest";
import { find, render } from "./helpers/dom";
const click = async (node: Element) => act(async () => { await userEvent.setup().click(node); });
const byName = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === name)!;

it("keeps shell transitions, one live region, body scrolling and shared geometry", async () => {
  const shell = (step: 1 | 2) => <LargeModal open title={`Step ${step}`} step={step} onClose={() => {}} bodyScroll="hidden" actions={<WizardFooter onNext={() => {}}/>}><p>Body</p></LargeModal>;
  const view = await render(shell(1));
  const panel = find<HTMLElement>(document.body, '[role="dialog"]');
  for (const cls of LARGE_MODAL_PANEL.split(" ")) expect(panel.classList.contains(cls)).toBe(true);
  expect(LARGE_MODAL_OVERLAY).toContain("bg-foreground/32");
  expect(panel.querySelectorAll("[aria-live]")).toHaveLength(1);
  expect(panel.querySelector("[aria-live]")?.textContent).toBe("");
  byName("Next").focus();
  await view.rerender(shell(2));
  expect(document.activeElement).toBe(panel.querySelector("[data-onboarding-body]"));
  expect(panel.querySelector("[aria-live]")?.textContent).toBe("Step 2");
  expect(panel.querySelector("[data-onboarding-body]")?.classList.contains("overflow-hidden")).toBe(true);
});

it("wizard busy preserves native disabled, label identity and trailing arrow; focus fixup is simulated", async () => {
  const next = vi.fn(); const back = vi.fn();
  const footer = (busy: boolean) => <WizardFooter busy={busy} showBack onBack={back} onNext={next}/>;
  const view = await render(footer(false));
  const button = byName("Next"); const label = button.firstChild;
  button.focus();
  const fixup = new MutationObserver(() => { if (document.activeElement?.matches(":disabled")) { const active = document.activeElement as HTMLElement; active.removeAttribute("disabled"); active.blur(); active.setAttribute("disabled", ""); } });
  fixup.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
  try {
    await view.rerender(footer(true));
    expect(button.disabled).toBe(true); expect(byName("Back").disabled).toBe(true);
    expect(document.activeElement).toBe(document.body);
    expect(button.childNodes[1]).toBe(label);
    expect(button.querySelectorAll("svg")).toHaveLength(2);
    expect(button.querySelector(".animate-spin")?.classList.contains("size-4")).toBe(true);
    button.click(); byName("Back").click(); expect(next).not.toHaveBeenCalled(); expect(back).not.toHaveBeenCalled();
    await view.rerender(footer(false));
    expect(button.firstChild).toBe(label); button.click(); expect(next).toHaveBeenCalledTimes(1);
  } finally { fixup.disconnect(); }
});

it("initial focus, Escape and explicit return target survive the extracted footer", async () => {
  function Host() {
    const [open, setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null); const input = useRef<HTMLInputElement>(null);
    return <><Button ref={trigger} onClick={() => setOpen(true)}>Open</Button><LargeModal open={open} title="Form" onClose={() => setOpen(false)} initialFocusRef={input} returnFocusRef={trigger} actions={<Button onClick={() => setOpen(false)}>Done</Button>}><input ref={input} aria-label="Name"/></LargeModal></>;
  }
  await render(<Host/>); await click(byName("Open"));
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Name");
  await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
  await vi.waitFor(() => expect(document.activeElement).toBe(byName("Open")));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("locked shell ignores Escape/outside, and custom actions/null keep the footer grouping", async () => {
  const close = vi.fn();
  const shell = (locked: boolean, actions: import("react").ReactNode) => <LargeModal open title="Locked" closeDisabled={locked} onClose={close} step={1} actions={actions}><input aria-label="Body field"/></LargeModal>;
  const view = await render(shell(true, <><Button>Cancel</Button><Button>Apply</Button></>));
  const footer = find<HTMLElement>(document.body, "footer");
  expect(footer.children).toHaveLength(2); expect(footer.lastElementChild?.querySelectorAll("button")).toHaveLength(2);
  expect(find<HTMLButtonElement>(document.body, '[aria-label="Close"]').disabled).toBe(true);
  await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
  expect(close).not.toHaveBeenCalled();
  const overlay = [...document.querySelectorAll<HTMLElement>("div[data-state='open']")].find(e => e.getAttribute("role") !== "dialog" && !e.querySelector('[role="dialog"]'))!;
  const event = new MouseEvent("mousedown", {bubbles: true, cancelable: true}); overlay.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  await view.rerender(shell(false, null));
  expect(footer.children).toHaveLength(1); expect(footer.textContent).toBe("Step 1 of 4");
  await act(async () => { await userEvent.setup().keyboard("{Escape}"); }); expect(close).toHaveBeenCalledTimes(1);
});
