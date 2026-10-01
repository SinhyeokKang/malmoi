// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

// user-event의 실시간 지연이 병렬 실행에서 기본 5초를 넘긴다 (POSTMORTEM 2026-09-13).
vi.setConfig({ testTimeout: 20_000 });

/**
 * **Sync가 도는 동안의 쓰기 거부를 편집자가 본다** (sync-lock S4 · R1 · R4 — spec 완료 조건 4·5).
 *
 * - 저장이 `sync-running`으로 거부되면 작은 Dialog("Syncing…")가 뜨고 초안은 그대로다. 일반 저장 실패 문장으로 접히지 않는다.
 * - Revert가 같은 사유로 거부되면(미리보기·확정 두 경로) 같은 Dialog다 — `unavailable`로 접지 않는다(R4).
 * - 착지 때 lease가 살아 있으면 헤더에 neutral 배너 한 줄이 서고 **Save는 끄지 않는다**(R1). OWNER의 [Sync]는 사유를 든 채 꺼진다.
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  save: vi.fn(), preview: vi.fn(), revert: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: mocks.save, previewTranslationRevert: mocks.preview, revertTranslationKey: mocks.revert, triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn().mockResolvedValue(null), prepareRepositorySync: vi.fn().mockResolvedValue(undefined) }));

import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { m } from "@/lib/i18n";

import { props } from "./helpers/workspace-props";

const startedAt = new Date("2026-10-01T16:30:12.000Z");
const reopensBy = new Date("2026-10-01T16:36:00.000Z");
const refusal = { ok: false, error: "sync-running", startedAt, reopensBy } as const;

const button = (label: string) => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === label);
  if (!found) throw new Error(`no button ${label}`);
  return found;
};
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const area = (container: HTMLElement, code: string) => container.querySelector<HTMLTextAreaElement>(`textarea[data-locale="${code}"]`)!;

/** jsdom은 꺼진 버튼의 포커스를 놓지 않는다 — 브라우저처럼 `body`로 떨어뜨린다 (POSTMORTEM 2026-09-20). */
let fixup: MutationObserver | undefined;
beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    active.removeAttribute("disabled");
    active.blur();
    active.setAttribute("disabled", "");
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
});
afterEach(() => { fixup?.disconnect(); });

it("저장이 sync-running이면 Syncing… Dialog가 다시 열리는 시각을 말하고 초안은 그대로다 — 일반 실패 문장이 없다", async () => {
  mocks.save.mockResolvedValueOnce(refusal);
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(button("Save"));
  await vi.waitFor(() => expect(dialog()).not.toBeNull());
  expect(dialog()?.textContent).toContain(m.translations.workspace.syncLock.title);
  const time = dialog()?.querySelector("time");
  expect(time?.getAttribute("dateTime")).toBe(reopensBy.toISOString());
  expect(time?.textContent).toBe("Oct 1, 2026 16:36 UTC");
  expect(dialog()?.textContent).toContain("You can't save edits until the sync finishes");
  expect(document.body.textContent).not.toContain(m.translations.workspace.footer.saveFailed.title);
  expect(area(container, "zh").value).toBe("空");

  await user.click(button("OK"));
  expect(dialog()).toBeNull();
  // 닫히면 연 자리로 — [Save]로 저장했으면 [Save]다.
  await vi.waitFor(() => expect(document.activeElement).toBe(button("Save")));
  // 취소 기준이 어긋나지 않는다 — 같은 초안이 미저장으로 남아 다음 저장이 그 값을 보낸다 (POSTMORTEM 2026-09-12).
  expect(area(container, "zh").value).toBe("空");
  mocks.save.mockResolvedValueOnce({ ok: true, keyId: "k1", cells: [{ localeCode: "zh", value: "空" }] });
  await user.click(button("Save"));
  expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ changes: [{ localeCode: "zh", value: "空" }] }));
  await vi.waitFor(() => expect(document.body.textContent).toContain(m.translations.workspace.footer.saved));
});

it("단축키로 저장했다 거부되면 닫힌 뒤 포커스가 그 입력으로 돌아간다", async () => {
  mocks.save.mockResolvedValueOnce(refusal);
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.keyboard("{Control>}{Enter}{/Control}");
  await vi.waitFor(() => expect(dialog()).not.toBeNull());
  await user.click(button("OK"));
  await vi.waitFor(() => expect(document.activeElement).toBe(area(container, "zh")));
});

it("Revert 미리보기가 sync-running이면 같은 Dialog이고 unavailable 사유로 접히지 않는다 (R4)", async () => {
  mocks.preview.mockResolvedValueOnce({ status: "blocked", reason: "sync-running", startedAt, reopensBy });
  const user = userEvent.setup();
  await render(<TranslationWorkspace {...props()} />);
  await user.click(button(m.translations.workspace.revert.button));
  await vi.waitFor(() => expect(dialog()?.textContent).toContain(m.translations.workspace.syncLock.title));
  expect(dialog()?.querySelector("time")?.getAttribute("dateTime")).toBe(reopensBy.toISOString());
  await user.click(button("OK"));
  expect(document.body.textContent).not.toContain(m.translations.workspace.revert.unavailable);
  // 거부는 그 순간의 사실이다 — Revert를 사유로 잠그지 않는다(lease가 끝나면 바로 다시 된다).
  expect(button(m.translations.workspace.revert.button).getAttribute("aria-disabled")).not.toBe("true");
});

it("Revert 확정이 sync-running이면 같은 Dialog다 (R4)", async () => {
  mocks.preview.mockResolvedValueOnce({ status: "ready", locales: [{ code: "ko", before: "비어 있음", after: "없음" }], confirmation: "c1" });
  mocks.revert.mockResolvedValueOnce({ status: "blocked", reason: "sync-running", startedAt, reopensBy });
  const user = userEvent.setup();
  await render(<TranslationWorkspace {...props()} />);
  await user.click(button(m.translations.workspace.revert.button));
  await vi.waitFor(() => expect(dialog()?.textContent).toContain(m.translations.workspace.revert.title));
  await user.click(button(m.translations.workspace.revert.confirm));
  await vi.waitFor(() => expect(dialog()?.textContent).toContain(m.translations.workspace.syncLock.title));
  expect(document.body.textContent).not.toContain(m.translations.workspace.revert.failed.title);
  await user.click(button("OK"));
  expect(document.body.textContent).not.toContain(m.translations.workspace.revert.unavailable);
});

it("착지 때 lease가 살아 있으면 배너가 서고 Save는 켜진 채이며 OWNER의 [Sync]는 사유를 든 채 꺼진다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props({ writeLock: { startedAt, reopensBy } })} />);
  const banner = [...document.querySelectorAll("[data-alert]")].find(node => node.textContent?.startsWith("Syncing…"));
  expect(banner?.querySelector("time")?.getAttribute("dateTime")).toBe(reopensBy.toISOString());
  // 상시 상태라 live 영역이 아니다 — 들어올 때마다 읽던 것을 끊지 않는다.
  expect(banner?.getAttribute("role")).toBeNull();
  // 착지 Dialog는 없다(R1).
  expect(dialog()).toBeNull();
  await user.type(area(container, "zh"), "空");
  const save = button("Save");
  expect(save.disabled).toBe(false);
  expect(save.getAttribute("aria-disabled")).not.toBe("true");
  const sync = button("Sync");
  expect(sync.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(sync.getAttribute("aria-describedby") ?? "")?.textContent).toBe(m.translations.workspace.sync.running);
});

it("lease가 없으면 배너도 Dialog도 없다 — 짝 단언", async () => {
  await render(<TranslationWorkspace {...props()} />);
  expect(document.body.textContent).not.toContain("Syncing…");
  expect(button("Sync").getAttribute("aria-disabled")).not.toBe("true");
});
