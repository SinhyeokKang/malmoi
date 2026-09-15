// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { SyncResult } from "@/components/home/sync-result";
import type { SurfaceImportResult } from "@/lib/import/result";
import { render } from "./helpers/dom";
const row = (surfaceSlug: string, status: SurfaceImportResult["status"], reason: SurfaceImportResult["reason"]): SurfaceImportResult => ({ surfaceSlug, status, reason, count: status === "imported" ? 4 : 0, failed: 0, errors: [] });
it("keeps unreadable and unapplied surfaces distinct with original diagnostics", async () => {
  const { container } = await render(<SyncResult onRetry={vi.fn()} outcome={{ ok: true, surfaces: [
    row("web", "imported", null), row("ci", "superseded", "superseded"), row("format", "failed", "invalid-format"),
    { ...row("broken", "failed", "parse-failed"), errors: [{ path: "locales/ko.json", code: "parse-failed" }] },
  ] }} />);
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  expect(container.textContent).toContain("1 surface could not be read");
  expect(container.textContent).toContain("2 surfaces were not replaced");
  for (const text of ["web", "ci", "format", "broken", "locales/ko.json"]) expect(container.textContent).toContain(text);
  expect(container.querySelector('[data-reason="superseded"]')).not.toBeNull();
  expect(container.querySelector('[data-error-code="parse-failed"]')).not.toBeNull();
  expect([...container.querySelectorAll('button')].some(b => b.textContent === "Try again")).toBe(true);
});
it("shows missing formats as danger without retry", async () => {
  const { container } = await render(<SyncResult onRetry={vi.fn()} outcome={{ ok: true, surfaces: [row("web", "failed", "invalid-format")] }} />);
  expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(container.querySelector("button")).toBeNull();
  expect(container.textContent).not.toContain("could not be read");
});
it("distinguishes partial file failures from whole-surface failures", async () => {
  const { container } = await render(<SyncResult outcome={{ ok: true, surfaces: [{ ...row("web", "partial", "partial-import"), count: 8, failed: 2 }] }} />);
  expect(container.querySelector('[role="status"]')).not.toBeNull(); expect(container.textContent).toContain("2");
  expect(container.textContent).not.toContain("surface could not be read");
});
it("shows action refusals with their reason and hides absent outcomes", async () => {
  const view = await render(<SyncResult outcome={null} />); expect(view.container.textContent).toBe("");
  await view.rerender(<SyncResult outcome={{ ok: false, error: "forbidden" }} />);
  expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
  expect(view.container.textContent).not.toContain("forbidden");
});
