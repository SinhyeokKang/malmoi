// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { expect, it, vi, afterEach } from "vitest";
import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { CopyButton } from "@/components/ui/copy-button";
import { SecretField } from "@/components/ui/secret-field";
import { Skeleton } from "@/components/ui/skeleton";
import { render, find } from "./helpers/dom";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.useRealTimers();
});
function clipboard(writeText: ReturnType<typeof vi.fn> | undefined) {
  Object.defineProperty(navigator, "clipboard", { value: writeText ? { writeText } : undefined, configurable: true });
}

it.each([["xs", "size-4", "rounded", "size-3"], ["sm", "size-7", "rounded-sm", "size-4"], ["md", "size-8", "rounded-sm", "size-4"], ["lg", "size-14", "rounded-sm", "size-5"]] as const)("ProjectThumbnail %s keeps real tile geometry and image failure fallback", async (size, tile, radius, glyph) => {
  const { container, rerender } = await render(<ProjectThumbnail name="Fixture project" src="/fixture.webp" size={size} />);
  const image = find<HTMLImageElement>(container, "img");
  expect(image.classList.contains("object-contain")).toBe(true);
  expect(image.parentElement?.classList.contains(tile)).toBe(true);
  expect(image.parentElement?.classList.contains(radius)).toBe(true);
  expect(image.parentElement?.className).not.toMatch(/bg-/);
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBeNull();
  expect(find(container, "svg").classList.contains(glyph)).toBe(true);
  await rerender(<ProjectThumbnail name="Fixture project" src="/new-fixture.webp" size={size} />);
  expect(find(container, "img").getAttribute("src")).toBe("/new-fixture.webp");
});

it("Skeleton unifies line mode with block mode while keeping default 4px and explicit radius", async () => {
  const { container } = await render(<><Skeleton /><Skeleton className="rounded-full" /><Skeleton size="sm" className="w-24 rounded-sm" /></>);
  const blocks = [...container.querySelectorAll('[aria-hidden="true"]')];
  expect(blocks[0]!.classList.contains("rounded")).toBe(true);
  expect(blocks[1]!.classList.contains("rounded-full")).toBe(true);
  expect(blocks[2]!.classList.contains("rounded-sm")).toBe(true);
  expect(blocks[2]!.classList.contains("h-[0.8em]")).toBe(true);
  const line = find(container, "[data-skeleton-line]");
  expect(line.classList.contains("text-sm")).toBe(true);
  expect(line.textContent).toBe("\u200b");
});

it("CopyButton labels success and clipboard absence/rejection without throwing", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  clipboard(writeText);
  const { container } = await render(<CopyButton value="fixture-value" />);
  const button = find<HTMLButtonElement>(container, "button");
  await user.click(button);
  expect(writeText).toHaveBeenCalledExactlyOnceWith("fixture-value");
  expect(button.textContent).toBe("Copied");
  clipboard(undefined);
  await user.click(button);
  expect(button.textContent).toBe("Couldn't copy — select it yourself");
  clipboard(vi.fn().mockRejectedValue(new Error("fixture denial")));
  await user.click(button);
  expect(button.textContent).toBe("Couldn't copy — select it yourself");
});

it.each(["sm", "md"] as const)("SecretField %s is named, readonly and selects its entire fixture on failure", async size => {
  const user = userEvent.setup();
  clipboard(undefined);
  const { container } = await render(<SecretField value="synthetic-fixture" label="Fixture token" size={size} />);
  const field = find<HTMLInputElement>(container, "input");
  expect(field.readOnly).toBe(true);
  expect(field.getAttribute("aria-label")).toBe("Fixture token");
  expect(field.classList.contains(size === "sm" ? "text-xs" : "text-sm")).toBe(true);
  if (size === "md") expect(field.classList.contains("select-all")).toBe(true);
  await user.click(find(container, "button"));
  expect(document.activeElement).toBe(field);
  expect(field.selectionStart).toBe(0);
  expect(field.selectionEnd).toBe("synthetic-fixture".length);
});

it("link copy failure exposes a selected readonly fallback; code copy has a live status", async () => {
  const user = userEvent.setup();
  clipboard(undefined);
  const { container } = await render(<><CopyButton variant="link" value="https://fixture.invalid" label="Copy link" /><CopyButton variant="code" value="fixture code" /></>);
  await user.click(find(container, 'button[aria-label="Copy link"]'));
  const field = find<HTMLInputElement>(container, "input");
  expect(field.readOnly).toBe(true);
  expect(field.value).toBe("https://fixture.invalid");
  expect(field.selectionStart).toBe(0);
  expect(field.selectionEnd).toBe(field.value.length);
  const buttons = [...container.querySelectorAll("button")];
  clipboard(vi.fn().mockResolvedValue(undefined));
  await user.click(buttons[1]!);
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Copied");
});

it("code copy feedback returns to idle after two seconds and repeats its live announcement", async () => {
  const user = userEvent.setup();
  clipboard(vi.fn().mockResolvedValue(undefined));
  const { container } = await render(<CopyButton variant="code" value="fixture code" />);
  const button = find<HTMLButtonElement>(container, "button");
  vi.useFakeTimers();
  await act(async () => { button.click(); });
  expect(button.textContent).toBe("Copied");
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Copied");
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(button.textContent).toBe("Copy");
  expect(container.querySelector('[role="status"]')?.textContent).toBe("");
  vi.useRealTimers();
  await act(async () => { await user.click(button); });
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Copied");
});

it("repeating code copy within two seconds clears the live status until the new clipboard result", async () => {
  let resolveCopy!: () => void;
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockImplementationOnce(() => new Promise<void>(resolve => { resolveCopy = resolve; }));
  clipboard(writeText);
  const { container } = await render(<CopyButton variant="code" value="fixture code" />);
  const button = find<HTMLButtonElement>(container, "button");
  const status = find(container, '[role="status"]');
  vi.useFakeTimers();
  await act(async () => { button.click(); });
  expect(status.textContent).toBe("Copied");
  await act(async () => { await vi.advanceTimersByTimeAsync(500); button.click(); });
  expect(status.textContent).toBe("");
  expect(writeText).toHaveBeenCalledTimes(2);
  await act(async () => { resolveCopy(); });
  expect(status.textContent).toBe("Copied");
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(button.textContent).toBe("Copied");
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(button.textContent).toBe("Copy");
  expect(status.textContent).toBe("");
});


it.each(["rejection", "synchronous throw"])("fresh CopyButton %s announces failure and invokes fallback once", async failure => {
  const user = userEvent.setup();
  const writeText = failure === "rejection" ? vi.fn().mockRejectedValue(new Error("fixture denial")) : vi.fn().mockImplementation(() => { throw new Error("fixture denial"); });
  clipboard(writeText);
  const fallback = vi.fn();
  const { container } = await render(<CopyButton value="fixture-value" onCopyFailed={fallback} />);
  const button = find<HTMLButtonElement>(container, "button");
  await user.click(button);
  expect(button.textContent).toBe("Couldn't copy — select it yourself");
  expect(fallback).toHaveBeenCalledTimes(1);
});
