// @vitest-environment jsdom
import { act, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyncButton as Control } from "@/components/home/sync-button";
import type { RepositoryImportOutcome } from "@/lib/import/result";
import { render } from "./helpers/dom";

// user-event의 실시간 지연이 병렬 실행에서 기본 5초를 넘긴다 (POSTMORTEM 2026-09-13).
vi.setConfig({ testTimeout: 20_000 });

/**
 * sync-lock S5 — **확인 → 진행 → 결과가 한 Dialog다** (spec 완료 조건 3 · design §4). 전엔 확정 즉시 Dialog가 닫히고 결과는 화면의 띠
 * Alert로 따로 섰다. 잠금이 생겨 Sync가 도는 동안 같은 프로젝트의 번역 쓰기가 거부되므로, 누른 사람이 "지금 돌고 있다"를 놓치지 않는
 * 자리가 Dialog 하나여야 한다.
 */
const mocks = vi.hoisted(() => ({ run: vi.fn(), pr: vi.fn(), refresh: vi.fn(), prepare: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: mocks.run, checkOpenPullRequest: mocks.pr, prepareRepositorySync: mocks.prepare }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const surface = { surfaceSlug: "web", status: "imported" as const, count: 3, failed: 0, unmanaged: 0, reason: null, errors: [] };
const success: RepositoryImportOutcome = { ok: true, remainingEdits: 0, surfaces: [surface] };
const props = { slug: "acme", surfaceSlug: "web", name: "malmoi web", branch: "main", role: "OWNER" as const, unsent: 0, onResult: vi.fn() };
function SyncButton(extra: Partial<React.ComponentProps<typeof Control>>) {
  const [open, setOpen] = useState(false);
  return <Control {...props} {...extra} open={open} onOpenChange={setOpen} />;
}
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function button(name: string) {
  const node = [...document.querySelectorAll("button")].find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
  if (!node) throw new Error(`Missing accessible button: ${name}`);
  return node;
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
async function click(name: string) { await act(async () => userEvent.setup().click(button(name))); }

let pending: { resolve: (value: RepositoryImportOutcome) => void } | null = null;
/** Action을 매달아 둔다 — 테스트 끝에서 반드시 푼다 (POSTMORTEM 2026-09-18 — 안 끝나는 async가 다음 테스트를 얽는다). */
function hang() { const run = deferred<RepositoryImportOutcome>(); mocks.run.mockReturnValue(run.promise); pending = run; return run; }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pr.mockResolvedValue(null);
  mocks.run.mockResolvedValue(success);
  mocks.prepare.mockResolvedValue({ approval: "digest-1", unsent: 0 });
});
afterEach(async () => {
  if (pending !== null) { const run = pending; pending = null; await act(async () => run.resolve(success)); }
  vi.useRealTimers();
});

it("확정해도 Dialog가 닫히지 않고 확정 버튼이 진행을 든 채 포커스를 지킨다", async () => {
  hang();
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  expect(dialog()).not.toBeNull();
  const confirm = button("Sync from repository");
  expect(confirm.disabled).toBe(false);
  expect(confirm.getAttribute("aria-disabled")).toBe("true");
  expect(confirm.getAttribute("aria-busy")).toBe("true");
  expect(document.activeElement).toBe(confirm);
  expect(button("Cancel").getAttribute("aria-disabled")).toBe("true");
  await click("Sync from repository");
  expect(mocks.run).toHaveBeenCalledOnce();
});

it("진행 중에는 Escape·바깥 클릭·X·Cancel 어느 것으로도 닫히지 않는다", async () => {
  hang();
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await act(async () => userEvent.setup().keyboard("{Escape}"));
  expect(dialog()).not.toBeNull();
  const overlay = document.querySelector<HTMLElement>("[data-state='open']:not([role='dialog'])");
  if (overlay !== null) await act(async () => userEvent.setup().pointer({ keys: "[MouseLeft]", target: overlay }));
  expect(dialog()).not.toBeNull();
  const close = button("Close");
  // X는 숨기지 않고 끈다 — `OnboardingModal`의 `closeDisabled`와 같은 동작이다.
  expect(close.disabled).toBe(true);
  await click("Cancel");
  expect(dialog()).not.toBeNull();
});

it("성공 결과가 같은 Dialog 본문에 서고 [Close] primary 하나로 닫혀 트리거로 돌아간다", async () => {
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await vi.waitFor(() => expect(dialog()?.querySelector('[role="status"]')?.textContent).toContain("Synced 3 keys from main"));
  expect(props.onResult).toHaveBeenCalledWith(success);
  const footer = dialog()?.querySelector("footer");
  expect([...footer?.querySelectorAll("button") ?? []].map(b => b.textContent?.trim())).toEqual(["Close"]);
  const close = footer?.querySelector("button");
  expect(close?.className).toContain("bg-primary");
  await vi.waitFor(() => expect(document.activeElement).toBe(close));
  expect(document.body.textContent).not.toContain("Sync from repository");
  await act(async () => userEvent.setup().click(close!));
  expect(dialog()).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(button("Sync")));
});

it("남은 편집이 있으면 결과가 warning이고 남은 사실을 원인 줄로 말한다", async () => {
  mocks.run.mockResolvedValue({ ok: true, remainingEdits: 2, surfaces: [surface] });
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await vi.waitFor(() => expect(dialog()?.textContent).toContain("2 unsent edits were kept"));
  expect(dialog()?.textContent).not.toContain("from main");
});

it("reconfirm의 [Try again]은 같은 Dialog를 확인 단계로 되돌리고 지문을 다시 받는다", async () => {
  mocks.run.mockResolvedValueOnce({ ok: false, error: "reconfirm" });
  mocks.prepare.mockResolvedValueOnce({ approval: "digest-1", unsent: 0 }).mockResolvedValueOnce({ approval: "digest-2", unsent: 4 });
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await vi.waitFor(() => expect(dialog()?.textContent).toContain("nothing was discarded"));
  await click("Try again");
  expect(dialog()).not.toBeNull();
  await vi.waitFor(() => expect(button("Discard changes and sync").getAttribute("aria-disabled")).not.toBe("true"));
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  expect(mocks.run).toHaveBeenCalledOnce();
  await click("Discard changes and sync");
  expect(mocks.run).toHaveBeenLastCalledWith({ slug: "acme", approval: "digest-2" });
});

it("already-running은 그 문장과 [Try again]이 선다", async () => {
  mocks.run.mockResolvedValue({ ok: false, error: "already-running" });
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await vi.waitFor(() => expect(dialog()?.textContent).toContain("A sync is already running"));
  expect(button("Try again")).toBeTruthy();
});

it("unauthorized는 새 탭 [Sign in]을 든다", async () => {
  mocks.run.mockResolvedValue({ ok: false, error: "unauthorized" });
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await vi.waitFor(() => expect(dialog()?.textContent).toContain("Your session ended"));
  const link = dialog()?.querySelector<HTMLAnchorElement>('a[href="/signin"]');
  expect(link?.textContent).toBe("Sign in");
  expect(link?.target).toBe("_blank");
  expect(dialog()?.querySelector('[role="alert"]')).not.toBeNull();
});

it("Action이 throw하면 unconfirmed 결과로 바뀌고 닫기가 돌아온다", async () => {
  const run = deferred<RepositoryImportOutcome>(); mocks.run.mockReturnValue(run.promise);
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  await act(async () => run.reject(new Error("offline")));
  await vi.waitFor(() => expect(dialog()?.textContent).toContain("We couldn't confirm whether the sync finished"));
  expect(props.onResult).toHaveBeenCalledWith({ ok: false, error: "unconfirmed" });
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(button("Close").disabled).toBe(false);
  await act(async () => userEvent.setup().keyboard("{Escape}"));
  expect(dialog()).toBeNull();
});

it("8초 뒤 지연 문구가 Dialog 안에 서고, 응답 없이 70초가 지나면 Logs 안내와 [Close]가 돌아온다", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const run = hang();
  await render(<SyncButton />);
  await click("Sync"); await click("Sync from repository");
  expect(dialog()?.textContent).not.toContain("Still working");
  await act(async () => { vi.advanceTimersByTime(8_000); });
  expect(dialog()?.textContent).toContain("Still working");
  expect(dialog()?.textContent).not.toContain("The result will be in Logs.");
  await act(async () => { vi.advanceTimersByTime(62_000); });
  expect(dialog()?.textContent).toContain("The result will be in Logs.");
  // 판정을 바꾸는 타이머가 아니다 — 결과 문장을 세우지 않고 확정 버튼은 여전히 진행이다.
  expect(dialog()?.querySelector('[role="alert"]')).toBeNull();
  expect(button("Close").disabled).toBe(false);
  await click("Close");
  expect(dialog()).toBeNull();
  // 늦게 온 응답은 닫힌 Dialog를 다시 열지 않는다 — 호스트에는 알린다(교차 잠금 대기).
  pending = null;
  await act(async () => run.resolve(success));
  expect(dialog()).toBeNull();
  expect(props.onResult).toHaveBeenCalledWith(success);
});
