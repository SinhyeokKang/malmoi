// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **번역 화면의 주 흐름에서 포커스가 `body`로 빠지지 않는다** (audit #32 — Save · #34 — 트리거 없는 확인창).
 *
 * ⚠️ Save는 저장 중 `loading`(진짜 `disabled`)이고 성공하면 저장할 것이 없어 **꺼진 채 남는다** — 결과 줄로 착지한다
 * (Revert 성공과 같은 자리, DESIGN §7). 실패면 다시 켜진 Save다. 단축키로 저장했으면 포커스가 입력에 그대로다.
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  save: vi.fn(), preview: vi.fn(), revert: vi.fn(), pull: vi.fn(), publishPreview: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search), usePathname: () => "/projects/acme/surfaces/web/translations" }));
vi.mock("@/app/(edit)/actions", () => ({
  saveTranslationKey: mocks.save, previewTranslationRevert: mocks.preview, revertTranslationKey: mocks.revert, triggerPullAction: mocks.pull,
}));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.publishPreview }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { SearchTrigger } from "@/components/search/search-trigger";
vi.mock("@/app/search/actions", () => ({ searchKeysAction: vi.fn().mockResolvedValue({ ok: true, hits: [] }), loadSearchMembershipsAction: vi.fn() }));

import { TranslationWorkspace } from "@/components/translations/workspace/workspace";

import { props } from "./helpers/workspace-props";

const area = (container: HTMLElement, code: string) => container.querySelector<HTMLTextAreaElement>(`textarea[data-locale="${code}"]`)!;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === label)!;
const row = (container: HTMLElement, key: string) => [...container.querySelectorAll<HTMLElement>("[data-key-row]")].find(el => el.dataset.keyRow === key)!;

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

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve: async (value: T) => { await act(async () => { resolve(value); }); } };
}

it("Save 성공 뒤 포커스가 결과 줄에 선다 — 꺼진 Save에 남아 body로 빠지지 않는다", async () => {
  const response = deferred<unknown>();
  mocks.save.mockReturnValue(response.promise);
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(button("Save"));
  await response.resolve({ ok: true, keyId: "k1", cells: [{ localeCode: "zh", value: "空" }] });
  expect(button("Save").disabled).toBe(true);
  expect(document.activeElement?.getAttribute("data-footer-result")).toBe("true");
});

it("Save 거부 뒤에는 다시 켜진 Save로 돌아온다 — 푸터 Alert가 답한다", async () => {
  const response = deferred<unknown>();
  mocks.save.mockReturnValue(response.promise);
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(button("Save"));
  await response.resolve({ ok: false, error: "unavailable" });
  expect(document.activeElement).toBe(button("Save"));
});

it("단축키 저장은 입력의 포커스를 옮기지 않는다 (짝)", async () => {
  mocks.save.mockResolvedValue({ ok: true, keyId: "k1", cells: [{ localeCode: "zh", value: "空" }] });
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(area(container, "zh"));
});

it("미저장 확인창을 Keep editing으로 닫으면 누른 키 행으로 돌아온다 — 트리거 없는 Dialog다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh"), "空");
  await user.click(row(container, "k2"));
  await user.click(button("Keep editing"));
  expect(document.activeElement).toBe(row(container, "k2"));
});


it("same-surface selected key change scrolls the new row after the server arrival", async () => {
  const base = props();
  const view = await render(<TranslationWorkspace {...base} />);
  const nextRow = row(view.container, "k2");
  expect(nextRow).not.toBeNull();
  const scroll = vi.spyOn(nextRow, "scrollIntoView");
  await view.rerender(<TranslationWorkspace {...base} query={{ ...base.query, key: "k2", keySurface: base.routeSurfaceSlug }} detail={{ ...base.detail!, key: { ...base.detail!.key, id: "k2" } }} />);
  expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
});


it.each(["pointer", "Enter"])("real search %s closes before the workspace leave guard opens its confirmation", async how => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }));
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations");
  // Workspace comes first: its document capture guard is mounted before any search item.
  const { container } = await render(<><TranslationWorkspace {...props()} /><SearchTrigger account={{ name: "Tester", email: null, image: null }} memberships={[{ slug: "acme", name: "Acme", role: "OWNER", archived: false }]} /></>);
  const user = userEvent.setup();
  await act(async () => { await user.type(area(container, "zh"), "Draft"); await user.click(document.querySelector('button[aria-label="Search"]')!); });
  const query = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  expect(query).not.toBeNull();
  await act(async () => { await user.type(query, "settings acme"); });
  const link = document.querySelector<HTMLAnchorElement>('[role="option"] a')!;
  expect(link).not.toBeNull();
  const clicked = vi.spyOn(link, "click");
  await act(async () => { if (how === "Enter") await user.keyboard("{Enter}"); else link.click(); });
  if (how === "Enter") expect(clicked).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="combobox"]')).toBeNull();
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(button("Keep editing")).not.toBeNull();
  expect(mocks.push).not.toHaveBeenCalled();
  await act(async () => { await user.click(button("Keep editing")); });
  vi.unstubAllGlobals();
});
