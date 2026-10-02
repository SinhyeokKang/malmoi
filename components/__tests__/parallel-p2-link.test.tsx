// @vitest-environment jsdom
import { NewProjectIcon } from "@/components/shell/new-project-icon";
import { ButtonLink } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { Plus } from "lucide-react";
import { act, createRef, type ComponentProps } from "react";
import { expect, it, vi } from "vitest";
import { find, render } from "./helpers/dom";
const status = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({
  useLinkStatus: () => status,
  default: ({ href, children, onNavigate, ...props }: ComponentProps<"a"> & { onNavigate?: (event: {preventDefault(): void}) => void }) => <a {...props} href={href} onClick={e => { props.onClick?.(e); if (!e.defaultPrevented && !e.metaKey) onNavigate?.({preventDefault: () => e.preventDefault()}); }}>{children}</a>,
}));

it("external is independent of newTab and preserves native anchor/ref/aria attributes", async () => {
  const ref = createRef<HTMLAnchorElement>();
  const view = await render(<ButtonLink ref={ref} href="https://example.com" external aria-label="Docs">Docs</ButtonLink>);
  const a = find<HTMLAnchorElement>(view.container, "a");
  expect(ref.current).toBe(a); expect(a.target).toBe(""); expect(a.rel).toBe("noopener noreferrer"); expect(a.querySelector("svg")).toBeNull();
  await view.rerender(<ButtonLink href="https://example.com" external newTab rel="nofollow">Docs</ButtonLink>);
  expect(a.target).toBe("_blank"); expect(new Set(a.rel.split(" "))).toEqual(new Set(["nofollow", "noopener", "noreferrer"]));
});

it("busy replaces a decorative glyph while preserving label and blocks same-tab navigation only", async () => {
  const onNavigate = vi.fn(); const view = await render(<ButtonLink href="/new" onNavigate={onNavigate}><Plus aria-hidden/><span>New</span></ButtonLink>);
  const a = find<HTMLAnchorElement>(view.container, "a"); const label = a.querySelector("span");
  await view.rerender(<ButtonLink href="/new" busy onNavigate={onNavigate}><Plus aria-hidden/><span>New</span></ButtonLink>);
  expect(a.getAttribute("aria-busy")).toBe("true"); expect(a.getAttribute("aria-disabled")).toBe("true");
  expect(a.querySelectorAll("svg")).toHaveLength(1); expect(a.querySelector(".lucide-plus")).toBeNull(); expect(a.querySelector("span")).toBe(label);
  await act(async () => a.click()); expect(onNavigate).not.toHaveBeenCalled();
  const modified = new MouseEvent("click", {bubbles: true, cancelable: true, metaKey: true}); a.dispatchEvent(modified); expect(modified.defaultPrevented).toBe(false);
});

it("framework pending belongs to the existing header leaf; ordinary ButtonLinks retain their glyph", async () => {
  status.pending = false;
  const view = await render(<ButtonLink href="/new"><Plus aria-hidden/><span>New</span></ButtonLink>);
  status.pending = true;
  await view.rerender(<ButtonLink href="/new"><Plus aria-hidden/><span>New</span></ButtonLink>);
  expect(view.container.querySelector(".lucide-plus")).not.toBeNull(); expect(view.container.querySelector(".animate-spin")).toBeNull();
  const header = await render(<NewProjectIcon />);
  expect(header.container.querySelector(".lucide-plus")).toBeNull();
  expect(header.container.querySelector(".animate-spin")?.classList.contains("size-4")).toBe(true);
  status.pending = false;
});

it("inline link owns blue text and ring without button geometry, passes navigation and names", async () => {
  const onNavigate = vi.fn(); const {container} = await render(<Link href="/help" onNavigate={onNavigate} aria-label="Help">Read help</Link>);
  const a = find<HTMLAnchorElement>(container, "a");
  for (const cls of ["text-link", "focus-visible:ring-ring", "focus-visible:ring-2", "focus-visible:outline-none"]) expect(a.classList.contains(cls)).toBe(true);
  expect(a.className).not.toContain("h-9"); await act(async () => a.click()); expect(onNavigate).toHaveBeenCalledTimes(1);
});

it("busy link keeps the actual 16px spinner independent of button dimensions", async () => {
  const {container} = await render(<ButtonLink href="/new" size="icon-lg" busy aria-label="New"><Plus aria-hidden/></ButtonLink>);
  const a = find<HTMLAnchorElement>(container, "a");
  expect(a.classList.contains("size-9")).toBe(true);
  expect(a.querySelector(".animate-spin")?.classList.contains("size-4")).toBe(true);
  expect(a.textContent).toBe(""); expect(a.getAttribute("aria-label")).toBe("New");
});

it("busy external link blocks ordinary click while preserving modified navigation", async () => {
  const click = vi.fn(); const {container} = await render(<ButtonLink href="https://example.com" external busy onClick={click}>Docs</ButtonLink>);
  const a = find<HTMLAnchorElement>(container, "a");
  const ordinary = new MouseEvent("click", {bubbles: true, cancelable: true});
  a.dispatchEvent(ordinary); expect(ordinary.defaultPrevented).toBe(true); expect(click).not.toHaveBeenCalled();
  const modified = new MouseEvent("click", {bubbles: true, cancelable: true, metaKey: true});
  a.dispatchEvent(modified); expect(modified.defaultPrevented).toBe(false); expect(click).toHaveBeenCalledOnce();
});

it("explicit external new-tab navigation remains available while the originating page is busy", async () => {
  const click = vi.fn(); const {container} = await render(<ButtonLink href="https://example.com" external newTab busy onClick={click}>Docs</ButtonLink>);
  const event = new MouseEvent("click", {bubbles: true, cancelable: true});
  container.querySelector("a")!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false); expect(click).toHaveBeenCalledOnce();
});
