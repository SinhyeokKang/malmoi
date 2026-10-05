// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **번역 화면의 [Sync]도 결과를 보인다** (audit #5 — POSTMORTEM 2026-09-08 재발). 전엔 `onResult`가 결과를 버리고
 * 무조건 `router.refresh()`만 불러, 거부(`already-running`·`reconfirm`…)가 설명 없이 버튼만 복귀했고 세션이 끊긴
 * 거부에서는 refresh가 로그인 이동이 되어 거부 문구조차 사라졌다.
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  run: vi.fn(), pr: vi.fn(), prepare: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: mocks.run, checkOpenPullRequest: mocks.pr, prepareRepositorySync: mocks.prepare }));

import { COMMIT_WAIT_MS } from "@/components/commit-wait";
import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";
import { en } from "@/messages/en";

import { props } from "./helpers/workspace-props";

function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === label);
  if (!found) throw new Error(`no button ${label}`);
  return found;
}
async function sync() {
  const user = userEvent.setup();
  await act(async () => user.click(button("Sync")));
  await act(async () => user.click(button("Discard changes and sync")));
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
  mocks.pr.mockResolvedValue(null);
  mocks.prepare.mockResolvedValue({ approval: "digest-1", unsent: 1 });
});

it.each(["already-running", "reconfirm", "unauthorized"] as const)("거부(%s)는 번역 화면에 사유를 세우고 refresh하지 않는다", async (error) => {
  mocks.run.mockResolvedValue({ ok: false, error });
  await render(<TranslationWorkspace {...props()} />);
  await sync();
  expect(mocks.run).toHaveBeenCalledOnce();
  const status = [...document.querySelectorAll('[role="status"], [role="alert"]')].map(node => node.textContent ?? "").join(" ");
  // ⚠️ 세션 만료도 Sync 문장이다 (QA D2) — 공용 접근 문장("save your work")을 빌리지 않는다.
  // Dialog 결과 단계는 세션 만료의 헤드라인을 다음 행동으로 바꿔 쓴다(R6 r2 — 제목이 "didn't run"을 말한다).
  const expected = error === "unauthorized" ? en.repositorySync.resultHeadline.unauthorized : en.repositorySync.errors[error];
  expect(status).toContain(expected);
  expect(mocks.refresh).not.toHaveBeenCalled();
});

// 성공에도 refresh하지 않는다 (audit-ux #12) — `runRepositoryImport`의 `revalidatePath`가 새 트리를 싣고 온다. 짝은 결과 한 줄이다.
it("성공은 결과 한 줄을 세우고 refresh하지 않는다 — 짝 단언", async () => {
  mocks.run.mockResolvedValue({ ok: true, remainingEdits: 0, surfaces: [{ surfaceSlug: "web", status: "imported", count: 3, failed: 0, reason: null, errors: [] }] });
  await render(<TranslationWorkspace {...props()} />);
  await sync();
  expect(document.querySelector('[role="status"]')?.textContent).toContain("from main");
  expect(mocks.refresh).not.toHaveBeenCalled();
});

/*
  **Sync가 들여온 키는 목록에 선다** (감사 #11) — 같은 조건의 재검증은 `mergeServerRows`로 행을 자리에 남기고 끼워 넣지 않는다
  (저장 뒤 행 위치 보존). Sync 성공은 새 세대다. ⚠️ 결과와 새 트리의 커밋 순서가 어느 쪽이어도 같다 — 실제 서버 props 교체로 잰다.
*/
describe("Sync 뒤 목록", () => {
  const imported = { ok: true, remainingEdits: 0, surfaces: [{ surfaceSlug: "web", status: "imported", count: 1, failed: 0, unmanaged: 0, reason: null, errors: [] }] } as const;
  const newRow = { keyId: "k3", surfaceSlug: "web", namespace: "common", key: "common.cancel", sourceText: "Cancel", missingCount: 2, totalLocales: 3, hasPending: false, hasReview: false, isNew: true };
  const listText = (container: HTMLElement) => container.querySelector("ul")?.textContent ?? "";
  function withRow(base: WorkspaceProps, rows = [...base.list.rows, newRow]): WorkspaceProps {
    return { ...base, list: { ...base.list, rows, matchedKeyCount: rows.length } };
  }

  it("결과가 먼저 오고 새 트리가 뒤에 와도 새 키가 목록에 선다", async () => {
    mocks.run.mockResolvedValue(imported);
    const initial = props();
    const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
    await sync();
    await rerender(<TranslationWorkspace {...withRow(initial)} />);
    expect(listText(container)).toContain("Cancel");
  });

  it("새 트리가 결과보다 먼저 커밋돼도 새 키가 목록에 선다", async () => {
    let resolve!: (value: typeof imported) => void;
    mocks.run.mockReturnValue(new Promise(r => { resolve = r; }));
    const initial = props();
    const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
    await sync();
    await rerender(<TranslationWorkspace {...withRow(initial)} />);
    await act(async () => resolve(imported));
    expect(listText(container)).toContain("Cancel");
  });

  it("처음 목록이 비어 있어도 Sync가 들여온 키가 선다", async () => {
    mocks.run.mockResolvedValue(imported);
    const empty = withRow(props(), []);
    const { container, rerender } = await render(<TranslationWorkspace {...empty} />);
    await sync();
    await rerender(<TranslationWorkspace {...withRow(empty, [newRow])} />);
    expect(listText(container)).toContain("Cancel");
  });

  // 새 세대 뒤의 일반 저장 재검증은 다시 병합이다 — `resync`가 풀렸다는 유일한 그물이다.
  const later = { ...newRow, keyId: "k4", key: "common.later", sourceText: "Later" };
  function afterSave(base: WorkspaceProps): WorkspaceProps {
    return withRow(base, [base.list.rows[0]!, newRow, later]);
  }
  function expectMerged(container: HTMLElement) {
    // k2(Save)는 서버 목록에서 빠졌지만 자리에 남아 savedOut이다 — 목록이 전량이라 선택 키가 아니어도 부재가 곧 조건 이탈이다(T6).
    // k4는 끼워 넣지 않는다.
    expect(listText(container)).toContain("Save");
    expect(container.querySelector('[data-key-row="k2"]')?.textContent).toContain(en.translations.workspace.list.saved);
    expect(listText(container)).not.toContain("Later");
  }

  it("Sync 세대 뒤 같은 조건의 재검증은 병합이다 — 행 위치·savedOut 보존", async () => {
    mocks.run.mockResolvedValue(imported);
    const initial = props();
    const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
    await sync();
    const synced = withRow(initial);
    await rerender(<TranslationWorkspace {...synced} />);
    expect(listText(container)).toContain("Cancel");
    await rerender(<TranslationWorkspace {...afterSave(synced)} />);
    expect(listText(container)).toContain("Cancel");
    expectMerged(container);
  });

  /**
   * ⚠️ **응답을 잃은 Sync도 새 세대다** (malmoi#132 r1) — 서버가 실제로 끝냈으면 refresh 트리에 새 키가 있는데, 병합만 하면
   * `mergeServerRows`가 끼워 넣지 않아 목록에 안 섰다(감사 #11 재발).
   */
  it("응답을 잃은 Sync의 refresh 트리에 온 새 키가 목록에 선다", async () => {
    mocks.run.mockRejectedValue(new Error("connection reset"));
    const initial = props();
    const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
    await sync();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await rerender(<TranslationWorkspace {...withRow(initial)} />);
    expect(listText(container)).toContain("Cancel");
  });

  it("실패한 Sync 결과는 새 세대를 시작하지 않는다", async () => {
    mocks.run.mockResolvedValue({ ok: false, error: "already-running" });
    const initial = props();
    const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
    await sync();
    await rerender(<TranslationWorkspace {...withRow(initial)} />);
    expect(listText(container)).not.toContain("Cancel");
  });

  it("새 트리가 끝내 안 오면 대기 상한 뒤 resync를 버린다 — 다음 저장 재검증은 병합이다", async () => {
    mocks.run.mockResolvedValue(imported);
    const initial = props();
    const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
    await act(async () => userEvent.setup().click(button("Sync")));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await act(async () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(button("Discard changes and sync")));
      expect(document.querySelector('[role="status"]')?.textContent).toContain("from main");
      await act(async () => { vi.advanceTimersByTime(COMMIT_WAIT_MS); });
    } finally { vi.useRealTimers(); }
    await rerender(<TranslationWorkspace {...afterSave(initial)} />);
    expectMerged(container);
  });

  it("Sync 없는 같은 조건의 재검증은 행을 끼워 넣지 않는다 — 짝 단언(저장 뒤 행 위치 보존)", async () => {
    const initial = props();
    const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
    await rerender(<TranslationWorkspace {...withRow(initial)} />);
    expect(listText(container)).toContain("Save");
    expect(listText(container)).not.toContain("Cancel");
  });
});
