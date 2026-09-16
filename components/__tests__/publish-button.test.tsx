// @vitest-environment jsdom
import { act, useRef } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { PublishButton, PublishModal, usePublish } from "@/components/publish-button";
import { render } from "./helpers/dom";
const mocks = vi.hoisted(() => ({ preview: vi.fn(), pull: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.preview }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: mocks.pull }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const preview = { groups: [], truncated: 0, total: 1, openPr: null };
function Host({ count = 1 }: { count?: number }) {
  const publish = usePublish("acme");
  const title = useRef<HTMLHeadingElement>(null);
  return <><h1 ref={title} tabIndex={-1}>Host</h1><PublishButton count={count} publish={publish} /><PublishModal slug="acme" publish={publish} fallbackFocusRef={title} /></>;
}
function button(name: string) {
  const node = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === name || b.getAttribute("aria-label") === name);
  if (!node) throw new Error(`Missing ${name}`);
  return node;
}
async function click(name: string) { await act(async () => { await userEvent.setup().click(button(name)); }); }
function deferred<T>() { let resolve!: (x: T) => void; let reject!: (x: unknown) => void; const promise = new Promise<T>((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
beforeEach(() => { vi.clearAllMocks(); mocks.preview.mockResolvedValue(preview); mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits" }); });
it("確認 전에는 쓰지 않고 0건 refresh 뒤에도 결과와 재열기를 보존한다", async () => {
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
