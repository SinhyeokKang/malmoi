// @vitest-environment jsdom
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { find, render } from "./helpers/dom";

describe("Badge appearance variants", () => {
  it.each([
    [undefined, undefined, "text-muted-foreground"],
    ["text", undefined, "text-muted-foreground"],
    ["soft-neutral", "bg-foreground/5", "text-foreground"],
    ["soft-amber", "bg-amber-100/80", "text-amber-800"],
    ["soft-green", "bg-green-100/80", "text-green-800"],
    ["soft-red", "bg-destructive/8", "text-destructive"],
  ] as const)("%s keeps its existing surface/text combination and content slot", async (variant, surface, color) => {
    const { container } = await render(<Badge variant={variant}><strong>3</strong> keys</Badge>);
    const badge = find(container, "span");
    expect(badge.textContent).toBe("3 keys");
    expect(badge.querySelector("strong")?.textContent).toBe("3");
    expect(badge.getAttribute("role")).toBeNull();
    for (const token of ["inline-flex", "min-w-5", "justify-center", "rounded-full", "text-2xs", "font-medium", color]) expect(badge.classList.contains(token), token).toBe(true);
    expect([...badge.classList].filter(token => token.startsWith("bg-"))).toEqual(surface === undefined ? [] : [surface]);
  });

  it("retains caller presentation overrides without discarding the content", async () => {
    const { container } = await render(<Badge variant="soft-neutral" className="text-xs px-2">OWNER</Badge>);
    const badge = find(container, "span");
    expect(badge.textContent).toBe("OWNER");
    expect(badge.classList.contains("text-xs")).toBe(true);
    expect(badge.classList.contains("text-2xs")).toBe(false);
    expect(badge.classList.contains("px-2")).toBe(true);
    expect(badge.classList.contains("px-1.5")).toBe(false);
  });
});

describe("Button size/variant contracts before the API rename", () => {
  it.each([
    [undefined, "h-9", "rounded-md", "px-3", "text-sm"],
    ["md", "h-9", "rounded-md", "px-3", "text-sm"],
    ["sm", "h-7", "rounded-sm", "px-2", "text-xs"],
    ["lg", "h-10", "rounded-lg", "px-4", "text-sm"],
  ] as const)("size %s keeps height, radius, padding and text scale", async (size, height, radius, padding, text) => {
    const { container } = await render(<Button size={size}>Save</Button>);
    const button = find(container, "button");
    for (const token of [height, radius, padding, text, "font-medium", "focus-visible:ring-2"]) expect(button.classList.contains(token), token).toBe(true);
    expect([...button.classList].filter(token => /^rounded-/.test(token))).toEqual([radius]);
    expect(button.textContent).toBe("Save");
  });

  it.each([
    [undefined, "bg-background", "text-foreground", "hover:bg-primary-foreground", true],
    ["default", "bg-background", "text-foreground", "hover:bg-primary-foreground", true],
    ["primary", "bg-primary", "text-primary-foreground", "hover:bg-primary/85", false],
    ["danger", "bg-destructive/8", "text-destructive", "hover:bg-destructive/12", false],
    ["ghost", undefined, "text-muted-foreground", "hover:text-foreground", false],
    ["link", undefined, "text-link", undefined, false],
  ] as const)("variant %s keeps the current enabled/disabled surface", async (variant, surface, color, hover, border) => {
    const view = await render(<Button variant={variant}>Save</Button>);
    const button = find<HTMLButtonElement>(view.container, "button");
    expect(button.classList.contains(color)).toBe(true);
    expect(button.classList.contains("border")).toBe(border);
    expect([...button.classList].filter(token => token.startsWith("bg-"))).toEqual(surface === undefined ? [] : [surface]);
    if (hover !== undefined) expect(button.classList.contains(hover)).toBe(true);
    await view.rerender(<Button variant={variant} disabled>Save</Button>);
    expect(button.disabled).toBe(true);
    expect(button.classList.contains("disabled:cursor-not-allowed")).toBe(true);
    const disabledColor = variant === "danger" ? "text-destructive/40" : "text-muted-foreground";
    expect(button.classList.contains(`disabled:${disabledColor}`)).toBe(true);
    expect(button.classList.contains(`aria-disabled:${disabledColor}`)).toBe(true);
    if (variant === "danger") {
      for (const prefix of ["disabled", "aria-disabled"]) expect(button.classList.contains(`${prefix}:bg-destructive/5`)).toBe(true);
      expect(button.classList.contains("aria-disabled:hover:bg-destructive/5")).toBe(true);
    }
  });

  it("forwards native form props/ref, aria metadata and caller shape overrides", async () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = await render(<Button ref={ref} type="submit" form="translation" name="intent" value="save"
      aria-label="Save translation" aria-describedby="help" data-action="save" className="h-8 rounded-sm">
      <span>Save</span>
    </Button>);
    const button = find<HTMLButtonElement>(container, "button");
    expect(ref.current).toBe(button);
    expect(button.type).toBe("submit");
    expect(button.getAttribute("form")).toBe("translation");
    expect(button.name).toBe("intent");
    expect(button.value).toBe("save");
    expect(button.getAttribute("aria-label")).toBe("Save translation");
    expect(button.getAttribute("aria-describedby")).toBe("help");
    expect(button.dataset.action).toBe("save");
    expect(button.querySelector("span")?.textContent).toBe("Save");
    expect(button.classList.contains("h-9")).toBe(false);
    expect(button.classList.contains("h-8")).toBe(true);
    expect(button.classList.contains("rounded-md")).toBe(false);
    expect(button.classList.contains("rounded-sm")).toBe(true);
  });
});
