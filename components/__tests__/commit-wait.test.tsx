// @vitest-environment jsdom
import { act, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **교차 잠금은 재검증된 서버 트리가 커밋될 때까지다** (malmoi#103). Action의 promise는 응답 머리에서 풀리고 새 RSC 트리는 그 뒤
 * 스트리밍으로 와서 0.6–1.5 s 늦게 커밋된다(Slow 4G 실측). 그 사이 잠금을 풀면 다른 트리거가 **옛 수치**로 켜진다 — Sync가 버린
 * 편집을 Publish가 보내자고 한다. 여기서는 Action을 곧장 풀고, 서버 prop이 **나중에** 바뀌는 것을 rerender로 흉내 낸다.
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  run: vi.fn(), pr: vi.fn(), prepare: vi.fn(),
  preview: vi.fn(), pull: vi.fn(), revertPreview: vi.fn(), revert: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: mocks.revertPreview, revertTranslationKey: mocks.revert, triggerPullAction: mocks.pull }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.preview }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: mocks.run, checkOpenPullRequest: mocks.pr, prepareRepositorySync: mocks.prepare, archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn() }));

import { COMMIT_WAIT_MS, useCommitWait } from "@/components/commit-wait";
import { HomeActions, HomeHeaderActions, HomeNotices } from "@/components/home/actions";
import { TranslationWorkspace } from "@/components/translations/workspace/workspace";

import { props } from "./helpers/workspace-props";

const synced = { ok: true, remainingEdits: 0, surfaces: [{ surfaceSlug: "web", status: "imported", count: 3, failed: 0, unmanaged: 0, reason: null, errors: [] }] };
const preview = { groups: [], truncated: 0, total: 1, keys: 1, openPr: null, withoutFile: 0, withoutKey: 0, sendable: { total: 1, keys: 1 } };
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("button")];
const named = (label: string | RegExp) => {
  const found = buttons().find(b => typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent?.trim() ?? ""));
  if (!found) throw new Error(`no button ${label}`);
  return found;
};
const locked = (node: HTMLButtonElement) => node.disabled || node.getAttribute("aria-disabled") === "true";
async function click(node: HTMLElement) { await act(async () => { await userEvent.setup().click(node); }); }

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
  mocks.pr.mockResolvedValue(null);
  mocks.prepare.mockResolvedValue({ approval: "d", unsent: 1 });
  mocks.preview.mockResolvedValue({ status: "ok", preview });
});
afterEach(() => { vi.useRealTimers(); });

describe("Home", () => {
  const repo = { owner: "o", name: "r", branch: "main", syncBranch: "malmoi-i18n/sync-acme" };
  /** `revision`이 바뀌면 서버가 새 트리를 보낸 것이다 — `HomeActions`의 `children`이 새 객체가 된다. */
  function Home({ unsent, revision }: { unsent: number; revision: number }) {
    return <HomeActions slug="acme">
      <HomeHeaderActions slug="acme" name="acme" branch="main" role="OWNER" unsent={unsent} paused={false} />
      <HomeNotices slug="acme" name="acme" branch="main" role="OWNER" state="default" repo={repo} unsent={unsent} failedSurface={null} reason={null} lastSyncAt={null} now={new Date()} />
      <output data-revision={revision} />
    </HomeActions>;
  }
  const publish = () => named(/^Publish/);

  it("Sync 성공 뒤 서버 트리가 올 때까지 Publish가 잠겨 있고, 오면 풀린다", async () => {
    mocks.run.mockResolvedValue(synced);
    const view = await render(<Home unsent={1} revision={0} />);
    await click(named("Sync"));
    await click(named("Discard changes and sync"));
    expect(document.body.textContent).toContain("Synced");
    expect(locked(publish())).toBe(true);
    await view.rerender(<Home unsent={1} revision={1} />);
    expect(locked(publish())).toBe(false);
  });

  it("Sync 거부는 재검증이 없으므로 곧장 Publish를 푼다 — 위의 짝", async () => {
    mocks.run.mockResolvedValue({ ok: false, error: "already-running" });
    await render(<Home unsent={1} revision={0} />);
    await click(named("Sync"));
    await click(named("Discard changes and sync"));
    expect(locked(publish())).toBe(false);
  });

  it("Publish 성공 뒤 서버 트리가 올 때까지 Sync가 잠겨 있다", async () => {
    mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    const view = await render(<Home unsent={1} revision={0} />);
    await click(publish());
    await click(named("Open pull request"));
    await click(named("Close"));
    expect(named("Sync").getAttribute("aria-disabled")).toBe("true");
    await view.rerender(<Home unsent={0} revision={1} />);
    expect(named("Sync").getAttribute("aria-disabled")).not.toBe("true");
  });
});

describe("번역 화면", () => {
  const nextServer = () => props({ list: { ...props().list } });

  it("Sync 성공 뒤 새 목록이 올 때까지 Publish·Revert가 잠겨 있다", async () => {
    mocks.run.mockResolvedValue(synced);
    const view = await render(<TranslationWorkspace {...props()} />);
    await click(named("Sync"));
    await click(named("Discard changes and sync"));
    expect(locked(named(/^Publish/))).toBe(true);
    expect(locked(named("Revert to last sent"))).toBe(true);
    await view.rerender(<TranslationWorkspace {...nextServer()} />);
    expect(locked(named(/^Publish/))).toBe(false);
    expect(locked(named("Revert to last sent"))).toBe(false);
  });

  it("Sync 실패는 곧장 푼다", async () => {
    mocks.run.mockRejectedValue(new Error("offline"));
    await render(<TranslationWorkspace {...props()} />);
    await click(named("Sync"));
    await click(named("Discard changes and sync"));
    expect(locked(named(/^Publish/))).toBe(false);
  });

  it("Publish 성공 뒤 새 목록이 올 때까지 Sync·Revert가 잠겨 있다", async () => {
    mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    const view = await render(<TranslationWorkspace {...props()} />);
    await click(named(/^Publish/));
    await click(named("Open pull request"));
    await click(named("Close"));
    expect(named("Sync").getAttribute("aria-disabled")).toBe("true");
    expect(locked(named("Revert to last sent"))).toBe(true);
    await view.rerender(<TranslationWorkspace {...nextServer()} />);
    expect(named("Sync").getAttribute("aria-disabled")).not.toBe("true");
  });

  it("Revert 성공 뒤 새 상세가 올 때까지 Revert가 잠겨 있다", async () => {
    mocks.revertPreview.mockResolvedValue({ status: "ready", locales: [{ code: "ko", before: "a", after: "b" }], confirmation: "f".repeat(64) });
    mocks.revert.mockResolvedValue({ status: "reverted", cells: [{ localeCode: "ko", value: "b" }] });
    // 되돌리지 않은 미전달 셀이 하나 남아야 Revert가 화면에 남는다(`zh`).
    const base = props();
    const twoPending = () => props({ list: { ...base.list }, detail: base.detail && "key" in base.detail ? { ...base.detail, locales: base.detail.locales.map(l => l.code === "zh" ? { ...l, value: "空", pending: true } : l) } : base.detail });
    const view = await render(<TranslationWorkspace {...twoPending()} />);
    await click(named("Revert to last sent"));
    await click(named("Revert"));
    expect(locked(named("Revert to last sent"))).toBe(true);
    await view.rerender(<TranslationWorkspace {...twoPending()} />);
    expect(locked(named("Revert to last sent"))).toBe(false);
  });
});

describe("useCommitWait", () => {
  function Probe({ signal }: { signal: object }) {
    const wait = useCommitWait(signal);
    // 액션이 시작된 때의 서버 트리 — 첫 렌더의 값이다.
    const [from] = useState(() => wait.snapshot());
    return <button data-waiting={wait.waiting} onClick={() => wait.wait(from)}>wait</button>;
  }
  const waiting = () => document.querySelector("button")?.getAttribute("data-waiting");

  it(`서버 트리가 끝내 안 바뀌어도 ${COMMIT_WAIT_MS} ms 뒤에 푼다 — 재검증이 같은 값을 줘도 영구히 잠기지 않는다`, async () => {
    vi.useFakeTimers();
    const signal = {};
    await render(<Probe signal={signal} />);
    await act(async () => { document.querySelector("button")!.click(); });
    expect(waiting()).toBe("true");
    await act(async () => { vi.advanceTimersByTime(COMMIT_WAIT_MS - 1); });
    expect(waiting()).toBe("true");
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(waiting()).toBe("false");
  });

  it("기다리기 전에 이미 새 트리가 커밋됐으면 기다리지 않는다", async () => {
    const view = await render(<Probe signal={{}} />);
    await view.rerender(<Probe signal={{}} />);
    await act(async () => { document.querySelector("button")!.click(); });
    expect(waiting()).toBe("false");
  });
});
