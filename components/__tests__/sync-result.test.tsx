// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { SyncResult } from "@/components/home/sync-result";
import type { SurfaceImportResult } from "@/lib/import/result";
import { render } from "./helpers/dom";

const props = { slug: "acme", branch: "main" };
const row = (surfaceSlug: string, status: SurfaceImportResult["status"], reason: SurfaceImportResult["reason"]): SurfaceImportResult =>
  ({ surfaceSlug, status, reason, count: status === "imported" ? 4 : 0, failed: 0, errors: [] });
function alert(container: HTMLElement) { return container.querySelector('[role="status"], [role="alert"]'); }
/** `Alert`의 본문 블록 — 있으면 두 줄 형이고 없으면 한 줄 형이다. */
/**
 * 형을 **줄 수**로 센다 — 한 줄(제목만)인지 두 줄(제목 + 원인)인지. ⚠️ 클래스 문자열로 본문 블록을
 * 찾으면 `Alert`의 래퍼 클래스가 바뀌는 순간 셀렉터가 **항상 null**이 되어 이 파일의 방어가 공허하게
 * green이 된다.
 */
function lines(container: HTMLElement) {
  const root = container.querySelector('[role="status"], [role="alert"]');
  return root === null ? 0 : root.querySelectorAll("p").length;
}

/**
 * 시안 `4e` — **형이 둘이고 그것이 방어다.** 색만 다르면 `Synced …`라는 앞머리가 같아 스캔에서
 * 성공으로 읽힌다 (ARCHITECTURE §0 불변식 9).
 */
it("전부 성공은 한 줄이고 표면을 나열하지 않는다", async () => {
  const { container } = await render(<SyncResult {...props} onDismiss={vi.fn()} outcome={{ ok: true, surfaces: [row("web", "imported", null), row("emails", "imported", null)] }} />);
  expect(alert(container)?.getAttribute("role")).toBe("status");
  expect(container.textContent).toContain("Synced 8 keys from main");
  expect(container.textContent).not.toContain("web");
  expect(lines(container)).toBe(1);
  expect([...container.querySelectorAll("button")].map(b => b.getAttribute("aria-label"))).toEqual(["Dismiss"]);
});

it("정상 0키도 같은 한 줄 형에 들어간다 — '이미 같았다' 갈래를 만들지 않는다", async () => {
  const { container } = await render(<SyncResult {...props} outcome={{ ok: true, surfaces: [{ ...row("web", "imported", null), count: 0 }] }} />);
  expect(container.textContent).toContain("Synced 0 keys from main");
  expect(lines(container)).toBe(1);
});

it("keeps unreadable and unapplied surfaces distinct with original diagnostics", async () => {
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: true, surfaces: [
    row("web", "imported", null), row("ci", "superseded", "superseded"), row("format", "failed", "invalid-format"),
    { ...row("broken", "failed", "parse-failed"), errors: [{ path: "locales/ko.json", code: "parse-failed" }] },
  ] }} />);
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  // ⚠️ 사고가 붙는 헤드라인에는 브랜치가 없다 (시안 `4e`) — 절이 셋이 되면 사고가 뒤로 밀린다.
  expect(container.textContent).toContain("Synced 4 keys, but 1 surface could not be read");
  expect(container.textContent).not.toContain("keys from main");
  expect(container.textContent).toContain("2 surfaces were not replaced");
  // 표면 이름은 헤드라인이 아니라 **원인 줄**에 산다 (spec §11.3) — 성공한 `web`은 서지 않는다.
  for (const text of ["ci", "format", "broken", "locales/ko.json"]) expect(container.textContent).toContain(text);
  expect(container.querySelector('[role="status"] .text-mono')?.textContent).toBe("broken");
  expect(container.querySelector('[data-reason="superseded"]')).not.toBeNull();
  expect(container.querySelector('[data-error-code="parse-failed"]')).not.toBeNull();
  expect([...container.querySelectorAll("button")].some(b => b.textContent === "Try again")).toBe(true);
});

/**
 * 시안 `4e`에 없는 갈래 — **들어간 표면이 하나도 없다.** `Synced …, but …`을 쓰면 `but` 앞 절이
 * 거짓이 되어 실패가 부분 성공으로 읽힌다.
 */
it("전 표면 실패는 성공 절을 앞에 두지 않는다", async () => {
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: true, surfaces: [row("web", "failed", "parse-failed")] }} />);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).toContain("Sync could not finish");
  expect(container.textContent).not.toContain("but");
  expect(container.textContent).toContain("web");
});

it("포맷 누락은 표면별 결과이고 재시도가 없다", async () => {
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: true, surfaces: [row("web", "failed", "invalid-format")] }} />);
  expect(container.textContent).not.toContain("could not be read");
  expect(container.textContent).toContain("This surface has no valid import format.");
  expect([...container.querySelectorAll("button")].some(b => b.textContent === "Try again")).toBe(false);
});

it("distinguishes partial file failures from whole-surface failures", async () => {
  const { container } = await render(<SyncResult {...props} outcome={{ ok: true, surfaces: [{ ...row("web", "partial", "partial-import"), count: 8, failed: 2 }] }} />);
  expect(container.querySelector('[role="status"]')).not.toBeNull(); expect(container.textContent).toContain("2");
  expect(container.textContent).not.toContain("surface could not be read");
  // ⚠️ 표면은 전부 들어갔지만 값이 버려졌다 — 브랜치를 붙이면 전부 성공한 헤드라인과 글자까지 같아진다.
  expect(container.querySelector("p")?.textContent).toBe("Synced 8 keys");
  expect(container.textContent).not.toContain("keys from main");
  expect(lines(container)).toBeGreaterThan(1);
});

/**
 * 시안 `4f` — 거부는 **"다시 누르면 되나"**로 갈린다. 닫아도 같은 버튼이 같은 거부를 반복하는
 * 갈래에는 닫기를 주지 않고, 고칠 자리가 있는 둘만 액션을 든다.
 */
it("거부는 tone·닫기·액션이 갈래마다 갈린다", async () => {
  const view = await render(<SyncResult {...props} outcome={null} />);
  expect(view.container.textContent).toBe("");

  await view.rerender(<SyncResult {...props} onDismiss={vi.fn()} outcome={{ ok: false, error: "already-running" }} />);
  expect(view.container.textContent).toContain("A sync is already running");
  expect(view.container.querySelector('button[aria-label="Dismiss"]')).not.toBeNull();

  await view.rerender(<SyncResult {...props} onDismiss={vi.fn()} outcome={{ ok: false, error: "not-ready" }} />);
  expect(view.container.querySelector('button[aria-label="Dismiss"]')).toBeNull();
  expect(view.container.querySelector('a[href="/projects/acme/settings"]')?.textContent).toBe("Open settings");
  expect(alert(view.container)?.className).toContain("bg-amber-50");

  await view.rerender(<SyncResult {...props} onDismiss={vi.fn()} outcome={{ ok: false, error: "not-connected" }} />);
  expect(view.container.querySelector('a[href="/projects/acme/settings"]')?.textContent).toBe("Reconnect");

  // ⚠️ 리포는 생성 시점 고정이라 [Reconnect]가 눌러도 실패할 버튼이다 (DESIGN §6.2).
  await view.rerender(<SyncResult {...props} onDismiss={vi.fn()} outcome={{ ok: false, error: "repo-replaced" }} />);
  expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
  expect(view.container.querySelector("a")).toBeNull();
  expect(view.container.querySelector('button[aria-label="Dismiss"]')).toBeNull();

  await view.rerender(<SyncResult {...props} outcome={{ ok: false, error: "forbidden" }} />);
  expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
  expect(view.container.textContent).not.toContain("forbidden");
});
