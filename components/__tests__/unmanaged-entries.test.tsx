// @vitest-environment jsdom
import { expect, it } from "vitest";

import { SyncResult } from "@/components/home/sync-result";
import type { SurfaceImportResult } from "@/lib/import/result";
import { ingestHeadline } from "@/lib/onboarding/message";

import { render } from "./helpers/dom";

/**
 * **관리하지 않는 항목은 안내이지 사고가 아니다** (B2 r3 — QA5). ts-dict의 `String(…)` 같은 값은 코드에 그대로 남고
 * 번역을 잃지 않는다 — Home Sync 결과가 warning으로 서거나 "not synced"를 말하면 사고로 읽힌다.
 * 대조로 진짜 실패가 섞이면 여전히 warning이다 (POSTMORTEM 2026-09-14).
 */
const row = (over: Partial<SurfaceImportResult>): SurfaceImportResult =>
  ({ surfaceSlug: "web", status: "imported", reason: null, count: 904, failed: 0, unmanaged: 0, errors: [], ...over });
const props = { slug: "acme", branch: "main" };

it("Home Sync 결과: 관리하지 않는 항목만 있으면 성공 한 줄 + 안내 문장이다", async () => {
  const { container } = await render(<SyncResult {...props} outcome={{ ok: true, remainingEdits: 0, surfaces: [row({ unmanaged: 2 })] }} />);
  const status = container.querySelector('[role="status"]')!;
  expect(status.textContent).toContain("Synced 904 keys from main");
  expect(status.textContent).toContain("2 entries aren't plain text and stay in the code.");
  expect(status.textContent).not.toContain("not synced");
  expect(status.className).not.toMatch(/amber|warning/);
});

it("대조: 진짜 실패가 섞이면 warning이고 not synced를 말한다", async () => {
  const { container } = await render(<SyncResult {...props} outcome={{ ok: true, remainingEdits: 0, surfaces: [row({ status: "partial", failed: 1, unmanaged: 2, errors: [{ path: "src/i18n/other.ts", code: "download-failed" }] })] }} />);
  expect(container.textContent).toContain("1 item was not synced");
  expect(container.textContent).toContain("2 entries aren't plain text and stay in the code.");
});

it("Sources 첫 Sync 결과 문장: 안내가 실패 문장을 대신하지 않는다", () => {
  expect(ingestHeadline(904, 0, 1)).toBe("Synced 904 keys. 1 entry isn't plain text and stays in the code.");
  expect(ingestHeadline(904, 0, 0)).toBe("Synced 904 keys.");
  expect(ingestHeadline(904, 1, 2)).toBe("Synced 904 keys, but 1 couldn't be read. 2 entries aren't plain text and stay in the code.");
});
