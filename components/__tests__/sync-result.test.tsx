// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { SyncResult } from "@/components/home/sync-result";
import type { SurfaceImportResult } from "@/lib/import/result";
import { render } from "./helpers/dom";
const row = (surfaceSlug: string, status: SurfaceImportResult["status"], reason: SurfaceImportResult["reason"]): SurfaceImportResult => ({ surfaceSlug, status, reason, count: status === "imported" ? 4 : 0, failed: 0, errors: [] });
it("読めない表面と未適用を分け、元の名前・理由・エラーパスを残す", async () => {
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
it("フォーマット欠落だけならdangerでTry againを出さない", async () => {
  const { container } = await render(<SyncResult onRetry={vi.fn()} outcome={{ ok: true, surfaces: [row("web", "failed", "invalid-format")] }} />);
  expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(container.querySelector("button")).toBeNull();
  expect(container.textContent).not.toContain("could not be read");
});
it("部分ファイル失敗を完全成功とせず、表面全体の読取失敗とも区別する", async () => {
  const { container } = await render(<SyncResult outcome={{ ok: true, surfaces: [{ ...row("web", "partial", "partial-import"), count: 8, failed: 2 }] }} />);
  expect(container.querySelector('[role="status"]')).not.toBeNull(); expect(container.textContent).toContain("2");
  expect(container.textContent).not.toContain("surface could not be read");
});
it("元のAction拒否は原因文付きのalert、結果がなければ何も出さない", async () => {
  const view = await render(<SyncResult outcome={null} />); expect(view.container.textContent).toBe("");
  await view.rerender(<SyncResult outcome={{ ok: false, error: "forbidden" }} />);
  expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
  expect(view.container.textContent).not.toContain("forbidden");
});
