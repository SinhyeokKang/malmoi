// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **키 목록은 Tab 정지점 하나다** (translation-filter-scope T8 — spec 조건 12). 목록이 전량이 되어 수천 행이 한 번에 서므로, 행마다 Tab
 * 정지점이면 목록을 지나가는 데만 수천 번을 눌러야 했다. roving tabindex — 정지점은 선택 행(없으면 첫 행)이고 ↑/↓·Home/End가 포커스를
 * 옮기며 Enter·Space가 선택한다. 포커스한 행이 목록에서 사라져도 포커스가 `body`로 빠지지 않는다(POSTMORTEM 2026-09-24).
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";
import type { TranslationListRow } from "@/lib/keys/translation-list";

import { props } from "./helpers/workspace-props";

const rowOf = (keyId: string): TranslationListRow => ({ keyId, surfaceSlug: "web", namespace: "common", key: `common.${keyId}`, sourceText: keyId, missingCount: 0, totalLocales: 3, hasPending: false, hasReview: false, isNew: false });
function three(over: Partial<WorkspaceProps> = {}): WorkspaceProps {
  const base = props(over);
  return { ...base, list: { ...base.list, rows: [base.list.rows[0]!, base.list.rows[1]!, rowOf("k3")], matchedKeyCount: 3 } };
}
const rows = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-key-row]")];
const row = (container: HTMLElement, key: string) => rows(container).find(el => el.dataset.keyRow === key)!;
const stops = (container: HTMLElement) => rows(container).filter(el => el.tabIndex === 0).map(el => el.dataset.keyRow);

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
});

it("Tab 정지점은 선택 행 하나다", async () => {
  const { container } = await render(<TranslationWorkspace {...three()} />);
  expect(stops(container)).toEqual(["k1"]);
});

it("선택이 없거나 선택 행이 목록에 없으면 첫 행이 정지점이다", async () => {
  const none = three({ query: { ...props().query, key: undefined, keySurface: undefined }, detail: null });
  const { container, rerender } = await render(<TranslationWorkspace {...none} />);
  expect(stops(container)).toEqual(["k1"]);
  // 새 조건(새 목록 세대)이어야 행이 바뀐다 — 같은 조건이면 빠진 행이 savedOut으로 자리에 남는다.
  const elsewhere = three({ query: { ...props().query, key: "k9", q: "k" }, detail: null });
  await rerender(<TranslationWorkspace {...elsewhere} list={{ ...elsewhere.list, rows: [rowOf("k2"), rowOf("k3")] }} />);
  expect(stops(container)).toEqual(["k2"]);
});

it("↑/↓·Home/End가 행 사이로 포커스를 옮기고, 정지점이 포커스를 따라간다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...three()} />);
  act(() => row(container, "k1").focus());
  await user.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(row(container, "k2"));
  expect(stops(container)).toEqual(["k2"]);
  await user.keyboard("{End}");
  expect(document.activeElement).toBe(row(container, "k3"));
  await user.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(row(container, "k3"));
  await user.keyboard("{Home}");
  expect(document.activeElement).toBe(row(container, "k1"));
  await user.keyboard("{ArrowUp}");
  expect(document.activeElement).toBe(row(container, "k1"));
  // 화살표는 선택하지 않는다 — 이동은 Enter·Space다.
  expect(mocks.replace).not.toHaveBeenCalled();
});

it.each([["Enter", "{Enter}"], ["Space", " "]])("%s가 포커스한 행을 선택한다", async (_name, key) => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...three()} />);
  act(() => row(container, "k1").focus());
  await user.keyboard("{ArrowDown}");
  await user.keyboard(key);
  expect(mocks.replace).toHaveBeenCalledOnce();
  expect(mocks.replace.mock.calls[0]?.[0]).toContain("key=k2");
});

it("Tab은 목록을 한 번에 지나간다 — 행마다 멈추지 않는다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...three()} />);
  act(() => row(container, "k1").focus());
  await user.tab();
  expect(rows(container)).not.toContain(document.activeElement);
});

it("포커스한 행이 목록에서 사라지면 포커스가 body로 빠지지 않고 목록의 정지점으로 간다", async () => {
  const initial = three({ query: { ...props().query, key: undefined, keySurface: undefined }, detail: null });
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  act(() => row(container, "k2").focus());
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, q: "k3" }} list={{ ...initial.list, rows: [rowOf("k3")], matchedKeyCount: 1 }} />);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(row(container, "k3"));
});

it("포커스한 행이 사라지고 목록이 비면 목록 제목으로 간다", async () => {
  const initial = three({ query: { ...props().query, key: undefined, keySurface: undefined }, detail: null });
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  act(() => row(container, "k2").focus());
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, q: "zz" }} list={{ ...initial.list, rows: [], matchedKeyCount: 0 }} />);
  expect(document.activeElement).toBe(container.querySelector("[data-panel=list] h2"));
});

it("목록이 비어 제목으로 옮긴 뒤에는 목록 포커스 표식을 푼다 — 나중에 목록이 다시 차도 포커스를 끌어오지 않는다", async () => {
  const initial = three({ query: { ...props().query, key: undefined, keySurface: undefined }, detail: null });
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  act(() => row(container, "k2").focus());
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, q: "zz" }} list={{ ...initial.list, rows: [], matchedKeyCount: 0 }} />);
  expect(document.activeElement).toBe(container.querySelector("[data-panel=list] h2"));
  // 사용자가 포커스를 다른 데로 치웠다(relatedTarget 없는 blur — 빈 자리 클릭과 같다).
  act(() => (document.activeElement as HTMLElement).blur());
  expect(document.activeElement).toBe(document.body);
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, q: "k" }} list={{ ...initial.list, rows: [rowOf("k3")], matchedKeyCount: 1 }} />);
  expect(document.activeElement).toBe(document.body);
});
