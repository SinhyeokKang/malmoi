// @vitest-environment jsdom
import { act, useState } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SyncButton as Control } from "@/components/home/sync-button";
import { SyncResult } from "@/components/home/sync-result";
import type { RepositoryImportOutcome } from "@/lib/import/result";
import { render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ run: vi.fn(), pr: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: mocks.run, checkOpenPullRequest: mocks.pr }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const success: RepositoryImportOutcome = { ok: true, surfaces: [{ surfaceSlug: "web", status: "imported", count: 0, failed: 0, reason: null, errors: [] }] };
const props = { slug: "acme", role: "OWNER" as const, unsent: 0, onResult: vi.fn() };
function SyncButton(props: Omit<React.ComponentProps<typeof Control>, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  return <Control {...props} open={open} onOpenChange={setOpen} />;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function button(name: string) {
  const node = [...document.querySelectorAll("button")].find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
  if (!node) throw new Error(`Missing accessible button: ${name}`);
  return node;
}
async function click(name: string) { await act(async () => userEvent.setup().click(button(name))); }
beforeEach(() => { vi.clearAllMocks(); mocks.pr.mockResolvedValue(null); mocks.run.mockResolvedValue(success); });

it("EDITOR에게는 없고 위험이 없는 OWNER도 별도 이름의 danger 확인을 거친다", async () => {
  const view = await render(<SyncButton {...props} role="EDITOR" />);
  expect(document.querySelector("button")).toBeNull();
  await view.rerender(<SyncButton {...props} />);
  await click("Sync");
  expect(button("Sync")).not.toBe(button("Sync from repository"));
  expect(button("Sync from repository").className).toContain("text-destructive");
  expect(mocks.run).not.toHaveBeenCalled();
  await click("Sync from repository");
  expect(mocks.run).toHaveBeenCalledWith({ slug: "acme" });
  expect(props.onResult).toHaveBeenCalledWith(success);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("실행 중 트리거는 포커스를 받고 클릭과 Enter 연타를 막는다", async () => {
  const run = deferred<RepositoryImportOutcome>(); mocks.run.mockReturnValue(run.promise);
  await render(<SyncButton {...props} />); await click("Sync"); await click("Sync from repository");
  const trigger = button("Sync");
  expect(trigger.disabled).toBe(false); expect(trigger.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(trigger);
  await click("Sync"); await act(async () => userEvent.setup().keyboard("{Enter}{Enter}"));
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(mocks.run).toHaveBeenCalledOnce();
  await act(async () => run.resolve(success));
  expect(trigger.getAttribute("aria-disabled")).toBe("false"); expect(document.activeElement).toBe(trigger);
});

it("PR은 조회 즉시 미확인이며 성공 null만 경고를 지운다", async () => {
  const pr = deferred<null>(); mocks.pr.mockReturnValue(pr.promise);
  await render(<SyncButton {...props} />); expect(mocks.pr).not.toHaveBeenCalled(); await click("Sync");
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain("couldn't confirm");
  await act(async () => pr.resolve(null));
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("couldn't confirm");
  await click("Cancel"); expect(document.activeElement).toBe(button("Sync"));
});

it("PR 실패도 미확인이고 닫기→재열기에서는 늦은 이전 응답을 무시한다", async () => {
  const old = deferred<{ number: number; url: string }>();
  mocks.pr.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error("offline"));
  await render(<SyncButton {...props} />); await click("Sync"); await click("Cancel"); await click("Sync");
  await act(async () => old.resolve({ number: 42, url: "https://github.com/o/r/pull/42" }));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("couldn't confirm");
  expect(document.querySelector('a[href*="pull/42"]')).toBeNull();
});

it("미발송 링크와 열린 PR을 함께 보여주며 발송만으로 안전하다고 약속하지 않는다", async () => {
  mocks.pr.mockResolvedValue({ number: 42, url: "https://github.com/o/r/pull/42" });
  await render(<SyncButton {...props} unsent={7} />); await click("Sync");
  expect(document.querySelector('a[href="/projects/acme/translations"]')?.textContent).toBe("Send changes first");
  expect(document.querySelector('a[href*="pull/42"]')?.textContent).toContain("#42");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("merged");
});

it("Home 호스트는 원결과를 소유해 refresh 후 재렌더에서도 보존한다", async () => {
  function Host({ refreshed }: { refreshed: number }) {
    const [outcome, setOutcome] = useState<RepositoryImportOutcome | null>(null);
    return <div data-refreshed={refreshed}><SyncButton {...props} onResult={setOutcome} /><SyncResult outcome={outcome} /></div>;
  }
  const view = await render(<Host refreshed={0} />); await click("Sync"); await click("Sync from repository");
  await view.rerender(<Host refreshed={1} />);
  expect(document.querySelector('[role="status"]')?.textContent).toContain("0 keys");
  expect(document.querySelector('[role="status"]')?.textContent).toContain("web");
});

it("Action 통신 실패는 실패 원결과를 호스트로 전달하고 다시 실행할 수 있다", async () => {
  mocks.run.mockRejectedValue(new Error("offline"));
  await render(<SyncButton {...props} />); await click("Sync"); await click("Sync from repository");
  expect(props.onResult).toHaveBeenCalledWith({ ok: false, error: "ingest-failed" });
  expect(button("Sync").getAttribute("aria-disabled")).toBe("false");
});

it("결과 재시도는 같은 확인 Dialog를 열고 확인 전에는 Action을 호출하지 않는다", async () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return <><Control {...props} open={open} onOpenChange={setOpen} /><SyncResult onRetry={() => setOpen(true)} outcome={{ ok: true, surfaces: [{ surfaceSlug: "web", status: "superseded", count: 0, failed: 0, reason: "superseded", errors: [] }] }} /></>;
  }
  await render(<Host />); await click("Try again");
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(mocks.pr).toHaveBeenCalledOnce(); expect(mocks.run).not.toHaveBeenCalled();
  await click("Sync from repository"); expect(mocks.run).toHaveBeenCalledOnce();
});

it("권한 변경으로 트리거가 사라지면 Home의 대체 포커스로 복귀한다", async () => {
  const fallback = { current: document.createElement("h2") };
  fallback.current.tabIndex = -1; document.body.append(fallback.current);
  const view = await render(<SyncButton {...props} fallbackFocusRef={fallback} />);
  await click("Sync"); await view.rerender(<SyncButton {...props} role="EDITOR" fallbackFocusRef={fallback} />);
  // Radix restores focus in its deferred unmount callback.
  await vi.waitFor(() => expect(document.activeElement).toBe(fallback.current));
  fallback.current.remove();
});
