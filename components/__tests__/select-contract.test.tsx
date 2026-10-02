// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act, createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { find, render } from "./helpers/dom";

describe("Select before the API rename", () => {
  it("forwards trigger identity/ref, placeholder and a caller width without losing the chevron", async () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = await render(<Select>
      <SelectTrigger ref={ref} aria-label="Role" aria-describedby="role-help" id="role" data-field="role" width={160}>
        <SelectValue placeholder="Choose a role" />
      </SelectTrigger>
      <SelectContent><SelectItem value="editor">Editor</SelectItem></SelectContent>
      <p id="role-help">Pick one role</p>
    </Select>);
    const trigger = find<HTMLButtonElement>(container, '[role="combobox"]');
    expect(ref.current).toBe(trigger);
    expect(trigger.id).toBe("role");
    expect(trigger.dataset.field).toBe("role");
    expect(trigger.getAttribute("aria-label")).toBe("Role");
    expect(document.getElementById(trigger.getAttribute("aria-describedby")!)?.textContent).toBe("Pick one role");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.hasAttribute("data-placeholder")).toBe(true);
    expect(trigger.textContent).toBe("Choose a role");
    for (const token of ["h-9", "w-40", "border-input", "focus-visible:ring-2", "[&>span]:min-w-0", "[&>span]:truncate", "data-[placeholder]:text-muted-foreground"]) expect(trigger.classList.contains(token), token).toBe(true);
    const chevron = find(trigger, "svg");
    expect(chevron.getAttribute("aria-hidden")).toBe("true");
    expect(chevron.classList.contains("size-4")).toBe(true);
    expect(chevron.classList.contains("shrink-0")).toBe(true);
  });

  it("portals two-line options, copies only the chosen label, and consumes Enter after selection", async () => {
    const change = vi.fn();
    const { container } = await render(<Select defaultValue="editor" onValueChange={change}>
      <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="editor" description={<em>Edit translations</em>}>Editor</SelectItem>
        <SelectItem value="blocked" disabled>Unavailable</SelectItem>
        <SelectItem value="owner" description="Manage the project">Owner</SelectItem>
      </SelectContent>
    </Select>);
    const trigger = find<HTMLButtonElement>(container, '[role="combobox"]');
    const user = userEvent.setup();
    trigger.focus();
    await act(async () => { await user.keyboard("{Enter}"); });
    const popup = find<HTMLElement>(document.body, '[role="listbox"]');
    expect(container.contains(popup)).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    for (const token of ["z-50", "shadow-md", "overflow-y-auto", "min-w-[var(--radix-select-trigger-width)]"]) expect(popup.classList.contains(token), token).toBe(true);
    const [editor, disabled, owner] = [...popup.querySelectorAll<HTMLElement>('[role="option"]')];
    const lines = find(editor!, "span.flex-col");
    expect(lines.children).toHaveLength(2);
    expect(lines.children[0]?.textContent).toBe("Editor");
    expect(lines.children[1]?.querySelector("em")?.textContent).toBe("Edit translations");
    expect(editor?.getAttribute("aria-selected")).toBe("true");
    expect(editor?.querySelector(".lucide-check")).not.toBeNull();
    expect(disabled?.getAttribute("aria-disabled")).toBe("true");
    expect(disabled?.classList.contains("data-[disabled]:pointer-events-none")).toBe(true);
    expect(disabled?.classList.contains("data-[disabled]:opacity-50")).toBe(true);
    await vi.waitFor(() => expect(document.activeElement).toBe(editor));
    await act(async () => { await user.keyboard("{ArrowDown}"); });
    await vi.waitFor(() => expect(document.activeElement).toBe(owner));
    // keydown과 다음 활성화 사이에 React 커밋을 허용해야 Enter 재활성화 방어를 실제로 잰다.
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => { owner!.dispatchEvent(enter); });
    expect(enter.defaultPrevented).toBe(true);
    expect(change).toHaveBeenCalledExactlyOnceWith("owner");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(trigger.textContent).toBe("Owner");
    expect(trigger.textContent).not.toContain("Manage the project");
  });

  it("native disabled blocks opening, while aria-disabled alone preserves focus and caller control", async () => {
    const view = await render(<Select disabled><SelectTrigger aria-label="Role"><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent><SelectItem value="editor">Editor</SelectItem></SelectContent></Select>);
    const trigger = find<HTMLButtonElement>(view.container, '[role="combobox"]');
    const user = userEvent.setup();
    expect(trigger.disabled).toBe(true);
    await act(async () => { await user.click(trigger); });
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    await view.rerender(<Select><SelectTrigger aria-label="Role" aria-disabled aria-describedby="reason"
      onPointerDown={event => event.preventDefault()} onKeyDown={event => { if (event.key !== "Tab") event.preventDefault(); }}>
      <SelectValue placeholder="Choose" />
    </SelectTrigger><SelectContent><SelectItem value="editor">Editor</SelectItem></SelectContent><p id="reason">Last owner</p></Select>);
    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.classList.contains("aria-disabled:bg-muted")).toBe(true);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    await act(async () => { await user.keyboard("{Enter}"); });
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("asChild has one custom trigger and still appends the decorative chevron", async () => {
    const { container } = await render(<Select><SelectTrigger asChild><button type="button" aria-label="Role"><SelectValue placeholder="Choose" /></button></SelectTrigger></Select>);
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(1);
    const trigger = find(container, '[role="combobox"]');
    expect(trigger.textContent).toBe("Choose");
    expect(trigger.querySelectorAll("svg")).toHaveLength(1);
  });
});
