// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **번역 화면의 Sync와 Publish는 서로를 잠그고, Revert는 둘 다에 잠긴다** (audit-ux #2 · #3 — DESIGN §6 "진행 중 상호 잠금").
 * 전엔 Home만 호스트가 두 pending을 배선했고 번역 화면은 각 버튼이 자기 연타만 막아, 한쪽이 도는 동안 다른 쪽이 눌렸다.
 * Revert의 비활성 사유("…while a save, publish, or sync is running")도 실제 조건은 저장·Revert뿐이었다.
 * ⚠️ `usePublish`만 바꿔 Publish 진행을 손으로 켠다 — 버튼은 실물이다(`PublishButton`의 비활성 판정을 그대로 잰다).
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  run: vi.fn(), pr: vi.fn(), prepare: vi.fn(), save: vi.fn(),
  publishing: { value: false },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: mocks.save, previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: mocks.run, checkOpenPullRequest: mocks.pr, prepareRepositorySync: mocks.prepare }));
vi.mock("@/components/publish-button", async (importActual) => {
  const actual = await importActual<typeof import("@/components/publish-button")>();
  return {
    ...actual,
    usePublish: () => ({ pending: mocks.publishing.value, result: null, triggerRef: { current: null }, launch: vi.fn(), showResult: vi.fn() }),
    PublishModal: () => null,
  };
});

import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import { m } from "@/lib/i18n";

import { props } from "./helpers/workspace-props";

const button = (label: string | RegExp) => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent ?? ""));
  if (!found) throw new Error(`no button ${label}`);
  return found;
};
const reason = (node: HTMLElement) => document.getElementById(node.getAttribute("aria-describedby") ?? "")?.textContent ?? "";

beforeEach(() => {
  for (const fn of [mocks.push, mocks.replace, mocks.refresh, mocks.run, mocks.pr, mocks.prepare, mocks.save]) fn.mockReset();
  mocks.publishing.value = false;
  window.sessionStorage.clear();
  mocks.pr.mockResolvedValue(null);
  mocks.prepare.mockResolvedValue({ approval: "digest-1", unsent: 1 });
});

it("Sync가 도는 동안 Publish와 Revert가 꺼지고 사유를 든다 — 짝 단언: 전에는 켜져 있다", async () => {
  const user = userEvent.setup();
  mocks.run.mockImplementation(() => new Promise(() => {}));
  await render(<TranslationWorkspace {...props()} />);
  expect(button(/^Publish/).getAttribute("aria-disabled")).not.toBe("true");
  expect(button("Revert to last sent").getAttribute("aria-disabled")).not.toBe("true");
  await act(async () => user.click(button("Sync")));
  await act(async () => user.click(button("Discard changes and sync")));
  expect(mocks.run).toHaveBeenCalledOnce();
  expect(button(/^Publish/).getAttribute("aria-disabled")).toBe("true");
  const revert = button("Revert to last sent");
  expect(revert.getAttribute("aria-disabled")).toBe("true");
  expect(reason(revert)).toBe(m.translations.workspace.revert.busy);
});

it("Publish가 도는 동안 Sync와 Revert가 꺼지고, Sync 확인 창은 예약되지 않는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { rerender } = await render(<TranslationWorkspace {...initial} />);
  // 짝 단언 — Publish 전에는 Sync가 켜져 있다.
  expect(button("Sync").getAttribute("aria-disabled")).not.toBe("true");
  mocks.publishing.value = true;
  await rerender(<TranslationWorkspace {...initial} />);
  const sync = button("Sync");
  expect(sync.getAttribute("aria-disabled")).toBe("true");
  // 라벨이 더는 `Publishing…`을 말하지 않으므로(D1) 사유가 원인을 든다 (audit-ux #10).
  expect(reason(sync)).toBe(m.repositorySync.waitPublish);
  const revert = button("Revert to last sent");
  expect(revert.getAttribute("aria-disabled")).toBe("true");
  expect(reason(revert)).toBe(m.translations.workspace.revert.busy);
  await act(async () => user.click(sync));
  mocks.publishing.value = false;
  await rerender(<TranslationWorkspace {...initial} />);
  // Publish가 끝나도 눌러 둔 적 없는 확인 창이 혼자 열리지 않는다(Home의 `setSyncOpen` 문과 같은 규칙).
  expect(document.body.textContent).not.toContain("Discard changes and sync");
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it("미저장이 있을 때 Publish 진행 중 Sync를 눌러도 폐기 확인창이 서지 않는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await user.type(container.querySelector<HTMLTextAreaElement>('textarea[data-locale="zh"]')!, "空");
  // 짝 단언 — Publish가 안 돌면 같은 클릭이 확인창을 세운다.
  await user.click(button("Sync"));
  expect(document.body.textContent).toContain("Discard your changes?");
  await user.click(button("Keep editing"));
  mocks.publishing.value = true;
  await rerender(<TranslationWorkspace {...initial} />);
  await user.click(button("Sync"));
  expect(document.body.textContent).not.toContain("Discard your changes?");
});

it("Sync가 도는 동안 미저장이 생겨도 [Sync]를 누르면 폐기 확인창이 서지 않는다", async () => {
  const user = userEvent.setup();
  let settle: (value: unknown) => void = () => {};
  mocks.run.mockImplementation(() => new Promise(resolve => { settle = resolve; }));
  const { container } = await render(<TranslationWorkspace {...props()} />);
  const zh = () => container.querySelector<HTMLTextAreaElement>('textarea[data-locale="zh"]')!;
  await user.type(zh(), "空");
  // 짝 단언 — Sync 전에는 같은 클릭이 확인창을 세운다.
  await user.click(button("Sync"));
  expect(document.body.textContent).toContain("Discard your changes?");
  await act(async () => user.click(button("Discard changes")));
  await act(async () => user.click(button("Discard changes and sync")));
  expect(mocks.run).toHaveBeenCalledOnce();
  await user.type(zh(), "空");
  await user.click(button("Sync"));
  expect(document.body.textContent).not.toContain("Discard your changes?");
  await act(async () => { settle({ ok: false, error: "unavailable" }); });
});

/**
 * **Publish가 도는 동안 [Save]도 잠긴다** (audit-ux #10 · D3). Server Action은 순서대로 실행되므로 풀어 두면 Save가 PR 생성
 * 뒤에 줄을 서서 스피너만 돌았다. 사유는 보이는 한 줄이고, 단축키(Ctrl/Cmd+Enter)도 같은 문을 지난다.
 */
it("Publish가 도는 동안 Save가 aria-disabled로 잠기고 사유를 보이며 단축키도 막힌다 — 짝 단언: 끝나면 저장된다", async () => {
  const user = userEvent.setup();
  mocks.save.mockResolvedValue({ ok: false, error: "save-failed" });
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  const zh = () => container.querySelector<HTMLTextAreaElement>('textarea[data-locale="zh"]')!;
  await user.type(zh(), "空");
  mocks.publishing.value = true;
  await rerender(<TranslationWorkspace {...initial} />);
  const save = button("Save");
  expect(save.disabled).toBe(false);
  expect(save.getAttribute("aria-disabled")).toBe("true");
  expect(reason(save)).toBe(m.repositorySync.waitPublish);
  // 보이는 사유 — describedby 대상이 sr-only가 아니다.
  expect(document.getElementById(save.getAttribute("aria-describedby") ?? "")?.className ?? "").not.toContain("sr-only");
  await user.click(save);
  await user.click(zh());
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.publishing.value = false;
  await rerender(<TranslationWorkspace {...initial} />);
  expect(button("Save").getAttribute("aria-disabled")).not.toBe("true");
  // 짝 단언 — 같은 단축키가 풀린 뒤에는 저장한다(`save()`의 `publish.pending` 문이 빠지면 위 단언이 red다).
  await user.click(zh());
  await act(async () => user.keyboard("{Control>}{Enter}{/Control}"));
  expect(mocks.save).toHaveBeenCalledOnce();
});

/** audit-ux #23 — 번역 화면의 [Sync]도 Home과 같은 지연 문구를 받는다. */
it("번역 화면의 Sync가 8초를 넘기면 지연 문구가 선다", async () => {
  let settle: (value: unknown) => void = () => {};
  mocks.run.mockImplementation(() => new Promise(resolve => { settle = resolve; }));
  await render(<TranslationWorkspace {...props()} />);
  await act(async () => userEvent.setup().click(button("Sync")));
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    await act(async () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(button("Discard changes and sync")));
    await act(async () => { vi.advanceTimersByTime(7_000); });
    expect(document.body.textContent).not.toContain(m.common.slow);
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(document.body.textContent).toContain(m.common.slow);
    await act(async () => { settle({ ok: false, error: "unavailable" }); });
  } finally { vi.useRealTimers(); }
});
