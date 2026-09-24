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

  /*
    ⚠️ **거부라고 다 트리가 없지 않다** (malmoi#103 r1) — `runRepositoryImport`의 `try` 안 거부는 `finally`의 `revalidatePath`를 지난다.
    특히 `reconfirm`은 미전달 수가 바뀐 뒤다. `try` 앞의 거부(`unauthorized`…)만 트리 없이 돌아온다.
  */
  it.each(["reconfirm", "already-running"])("try 안의 Sync 거부(%s)도 서버 트리가 올 때까지 Publish를 잠근다", async error => {
    mocks.run.mockResolvedValue({ ok: false, error });
    const view = await render(<Home unsent={1} revision={0} />);
    await click(named("Sync"));
    await click(named("Discard changes and sync"));
    expect(locked(publish())).toBe(true);
    await view.rerender(<Home unsent={1} revision={1} />);
    expect(locked(publish())).toBe(false);
  });

  it("try 앞의 Sync 거부는 트리가 없으므로 곧장 Publish를 푼다 — 위의 짝", async () => {
    mocks.run.mockResolvedValue({ ok: false, error: "unauthorized" });
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
    expect(locked(named("Revert to last sent"))).toBe(false);
  });

  /*
    ⚠️ **Publish `failed`는 둘로 갈린다** (malmoi#103 r1) — `runSync`를 지난 실패는 `triggerPullAction`이 재검증한다. 표식은 `runSync`만
    내는 코드다(`pullRevalidates`) — `delivery`는 게이트 거부도 `not-started`라 못 가른다.
  */
  it("runSync를 지난 Publish 실패는 새 트리까지 Sync를 잠그고, 그 앞의 거부는 곧장 푼다", async () => {
    mocks.pull.mockResolvedValue({ status: "failed", error: "already-running", delivery: "not-started", retryable: false });
    const view = await render(<TranslationWorkspace {...props()} />);
    await click(named(/^Publish/));
    await click(named("Open pull request"));
    await click(named("Close"));
    expect(named("Sync").getAttribute("aria-disabled")).toBe("true");
    await view.rerender(<TranslationWorkspace {...nextServer()} />);
    expect(named("Sync").getAttribute("aria-disabled")).not.toBe("true");

    mocks.pull.mockResolvedValue({ status: "failed", error: "unauthorized", delivery: "not-started", retryable: false });
    await click(named(/^Publish/));
    await click(named("Open pull request"));
    // 거부 결과 모달은 닫기 문구가 다르다 — 모달 뒤의 트리거를 그대로 잰다.
    expect(named("Sync").getAttribute("aria-disabled")).not.toBe("true");
  });

  it("트리를 기다리는 동안 Publish를 누르면 새 미리보기가 아니라 결과를 연다", async () => {
    mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits" });
    await render(<TranslationWorkspace {...props()} />);
    await click(named(/^Publish/));
    await click(named("Open pull request"));
    await click(named("Close"));
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    await click(named(/^Publish/));
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Nothing changed in the files");
  });

  it("도는 동안 키를 옮겨 서버 prop이 바뀌어도 결과 뒤의 새 트리까지 기다린다", async () => {
    let settle: (value: unknown) => void = () => {};
    mocks.run.mockImplementation(() => new Promise(resolve => { settle = resolve; }));
    const view = await render(<TranslationWorkspace {...props()} />);
    await click(named("Sync"));
    await click(named("Discard changes and sync"));
    // 키·필터 이동 — 서버가 새 상세를 보냈다(재검증 트리가 아니다).
    await view.rerender(<TranslationWorkspace {...nextServer()} />);
    await act(async () => { settle(synced); });
    expect(locked(named(/^Publish/))).toBe(true);
    await view.rerender(<TranslationWorkspace {...nextServer()} />);
    expect(locked(named(/^Publish/))).toBe(false);
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

  it("Revert가 reverted가 아니면 곧장 푼다 — 위의 짝", async () => {
    mocks.revertPreview.mockResolvedValue({ status: "ready", locales: [{ code: "ko", before: "a", after: "b" }], confirmation: "f".repeat(64) });
    mocks.revert.mockResolvedValue({ status: "blocked", reason: "busy" });
    await render(<TranslationWorkspace {...props()} />);
    await click(named("Revert to last sent"));
    await click(named("Revert"));
    expect(named("Revert to last sent").getAttribute("aria-busy")).toBeNull();
  });
});

describe("useCommitWait", () => {
  function Probe({ signal }: { signal: object }) {
    const commit = useCommitWait(signal);
    return <button data-waiting={commit.waiting} onClick={() => commit.wait()}>wait</button>;
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

  it("부른 뒤 서버 prop이 바뀌면 푼다 — 같은 객체로 다시 그려지면 그대로다", async () => {
    const signal = {};
    const view = await render(<Probe signal={signal} />);
    await act(async () => { document.querySelector("button")!.click(); });
    await view.rerender(<Probe signal={signal} />);
    expect(waiting()).toBe("true");
    await view.rerender(<Probe signal={{}} />);
    expect(waiting()).toBe("false");
  });
});
