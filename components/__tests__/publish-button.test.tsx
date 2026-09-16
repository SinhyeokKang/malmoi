// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeActions, HomeTitle, HomeHeaderActions, HomeNotices } from "@/components/home/actions";
import { TranslationsHeader } from "@/components/translations/header";
import { render } from "./helpers/dom";
const mocks = vi.hoisted(() => ({ preview: vi.fn(), pull: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.preview }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: mocks.pull }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn() }));
const preview = { groups: [], truncated: 0, total: 1, openPr: null };
function button(name: string) {
  const node = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === name || b.getAttribute("aria-label") === name);
  if (!node) throw new Error(`Missing ${name}`);
  return node;
}
async function click(name: string) { await act(async () => { await userEvent.setup().click(button(name)); }); }
function deferred<T>() { let resolve!: (x: T) => void; let reject!: (x: unknown) => void; const promise = new Promise<T>((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
beforeEach(() => { vi.clearAllMocks(); mocks.preview.mockResolvedValue(preview); mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits" }); });
describe.each(["translations", "home"])("%s 호스트", kind => {
function Host({ count = 1 }: { count?: number }) {
  if (kind === "home") return <HomeActions slug="acme"><HomeTitle archived={false}>Host</HomeTitle>
    <HomeHeaderActions slug="acme" name="Host" branch="main" role="EDITOR" unsent={count} paused={false} />
    <HomeNotices slug="acme" name="Host" branch="main" role="EDITOR" state="default" failedSurface={null} reason={null} lastSyncAt={null} now={new Date()} />
  </HomeActions>;
  return <TranslationsHeader slug="acme" surfaceSlug="default" surfaces={[]} totalCount={1} query={{}} chipQuery={{}}
    namespaces={[]} locales={[]} selected={[]} fallback={[]} unpublished={count} lastSentLabel={null} lastPrUrl={null}
    dismissKey="never" baseLocale="en" declaredBaseLocale="en"><p>Rows</p></TranslationsHeader>;
}
it("확인 전에는 쓰지 않고 0건 refresh 뒤에도 결과와 재열기를 보존한다", async () => {
  const view = await render(<Host />);
  await click("Publish1");
  expect(mocks.pull).not.toHaveBeenCalled();
  await click("Publish changes");
  expect(mocks.pull).toHaveBeenCalledTimes(1);
  await view.rerender(<Host count={0} />);
  expect(document.body.textContent).toContain("No changes to send.");
  await click("Close");
  await click("View result");
  expect(mocks.preview).toHaveBeenCalledTimes(1);
  expect(mocks.pull).toHaveBeenCalledTimes(1);
});
it("닫힌 동안 실행을 유지하고 완료가 자동으로 열리지 않는다", async () => {
  const run = deferred<unknown>(); mocks.pull.mockReturnValue(run.promise);
  await render(<Host />); await click("Publish1"); await click("Publish changes"); await click("Close");
  await click("Publishing…"); expect(mocks.pull).toHaveBeenCalledTimes(1); await click("Close");
  await act(async () => run.resolve({ status: "committed", pr: "updated", prUrl: "https://github.com/o/r/pull/12", changed: ["ko.json"], warnings: ["web: ko.json: bad\n ^"] }));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("View result"); expect(document.body.textContent).toContain("#12"); expect(document.querySelector("details")).toBeNull();
  expect(document.body.textContent).toContain("bad\n ^");
});
it.each([true, false])("이전 조회의 늦은 응답을 무시한다 (성공=%s)", async success => {
  const a = deferred<unknown>(); const b = deferred<unknown>();
  mocks.preview.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  await render(<Host />); await click("Publish1"); await click("Close"); await click("Publish1");
  await act(async () => { if (success) a.resolve(preview); else a.reject(new Error("old")); });
  expect(document.body.textContent).not.toContain("Publish changes");
  await act(async () => b.resolve(preview)); await click("Publish changes"); expect(mocks.pull).toHaveBeenCalledTimes(1);
});
it("조회 실패와 응답 유실 재시도 모두 새 확인을 요구한다", async () => {
  mocks.preview.mockRejectedValueOnce(new Error("read")); mocks.pull.mockRejectedValueOnce(new Error("lost"));
  await render(<Host />); await click("Publish1"); expect(document.body.textContent).not.toContain("Publish changes");
  await click("Try again"); expect(mocks.pull).not.toHaveBeenCalled(); await click("Publish changes");
  expect(document.body.textContent).toContain("We couldn't confirm whether your changes were sent.");
  expect(document.body.textContent).not.toContain("Nothing was sent");
  expect(mocks.refresh).not.toHaveBeenCalled();
  await click("Try again"); expect(mocks.pull).toHaveBeenCalledTimes(1);
  await click("Publish changes"); expect(mocks.pull).toHaveBeenCalledTimes(2);
});
it("열기는 컨테이너, 열린 상태 전이는 본문, disabled 호출부의 닫기는 제목으로 돌아간다", async () => {
  const read = deferred<unknown>(); mocks.preview.mockReturnValueOnce(read.promise);
  const view = await render(<Host />); await click("Publish1");
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
  await act(async () => read.resolve(preview));
  expect(document.activeElement).toBe(document.querySelector('[data-onboarding-body]'));
  await click("Close");
  const read2 = deferred<unknown>(); mocks.preview.mockReturnValueOnce(read2.promise);
  await click("Publish1");
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("");
  await act(async () => read2.resolve(preview)); await click("Publish changes");
  await view.rerender(<Host count={0} />); await click("Close");
  expect(document.activeElement?.textContent).toBe(kind === "home" ? "Host" : "Translations");
});
it("실패의 alert만 낭독하고 닫힌 동안 완료는 포커스를 빼앗지 않는다", async () => {
  const run = deferred<unknown>(); mocks.pull.mockReturnValueOnce(run.promise);
  await render(<Host />); await click("Publish1"); await click("Publish changes");
  expect(document.activeElement).toBe(document.querySelector('[data-onboarding-body]'));
  await click("Close"); const focused = document.activeElement;
  await act(async () => run.resolve({ status: "failed", error: "unavailable", retryable: true, delivery: "unknown" }));
  expect(document.activeElement).toBe(focused);
  await click("View result");
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
  expect(document.querySelector('[aria-live="polite"]')).toBeNull();
  expect(document.body.textContent).not.toContain("Reference");
  expect(document.body.textContent).not.toContain("Next");
});

});
