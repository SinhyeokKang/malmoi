// @vitest-environment jsdom
import { LocaleMeter } from "@/components/locale-meter";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Meter } from "@/components/ui/meter";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { find, render } from "./helpers/dom";

it.each([false, true])("meter preserves decorative done/review proportions and dimmed colors (%s)", async dimmed => {
  const {container} = await render(<Meter done={60} review={20} dimmed={dimmed}/>);
  const bar = find<HTMLElement>(container, "span[aria-hidden]");
  expect(bar.getAttribute("aria-hidden")).toBe("true"); expect(bar.getAttribute("role")).toBeNull();
  expect([...bar.children].map(n => (n as HTMLElement).style.width)).toEqual(["60%", "20%"]);
  expect(bar.children[0]?.classList.contains(dimmed ? "bg-foreground/25" : "bg-foreground/85")).toBe(true);
  expect(bar.children[1]?.classList.contains("bg-amber-500")).toBe(true);
  for (const cls of ["h-1", "rounded-full", "overflow-hidden"]) expect(bar.classList.contains(cls)).toBe(true);
});

it("locale zero denominator stays finite and server-renderable", () => {
  const html = renderToStaticMarkup(<LocaleMeter locale={{code: "en", surfaceSlug: "main", isBase: true, total: 0, done: 0, review: 0, percent: 0}}/>);
  expect(html).not.toMatch(/NaN|Infinity/); expect(html).toContain("width:0%");
  expect(readFileSync("components/ui/meter.tsx", "utf8")).not.toMatch(/["']use client["']/);
});

it("error announces once, preserves p/18 and description slots, and calls retry", async () => {
  const retry = vi.fn(); const {container} = await render(<ErrorState title="Unable to load" description={<span>Try later</span>} retry={retry} retryLabel="Retry"/>);
  expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
  const title = [...container.querySelectorAll("p")].find(p => p.textContent === "Unable to load")!;
  expect(title.classList.contains("text-lg")).toBe(true); expect(container.querySelector("h1")).toBeNull();
  expect(container.querySelector("p span")?.textContent).toBe("Try later");
  find<HTMLButtonElement>(container, "button").click(); expect(retry).toHaveBeenCalledTimes(1);
});

it("empty/404 stays server-compatible and never announces an error", () => {
  const html = renderToStaticMarkup(<EmptyState title="Not found" description="No page"/>);
  expect(html).not.toContain('role="alert"'); expect(html).toContain("text-lg");
  expect(readFileSync("components/ui/empty-state.tsx", "utf8")).not.toMatch(/["']use client["']/);
});
