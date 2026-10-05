// @vitest-environment jsdom
import { act, Profiler, Suspense, use, useLayoutEffect, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **번역 화면의 조작은 누른 순간 반응하고, 서버 왕복을 필요한 만큼만 한다** (audit-ux U3 — #7·#16·#18·#19·#20·#29·#30·#33).
 *
 * ⚠️ **`router`를 Next처럼 흉내 낸다** (`translation-workspace-navigation.test.tsx`와 같은 하네스) — 목이 하네스 상태를 바꾸고
 * 그 렌더가 `gate`에서 suspend한다. 이동이 transition 안이면 옛 화면이 그대로 서고, 응답 도착은 `gate`를 푸는 것이다.
 * 주소창도 흉내 낸다 — `push`·`replace`가 `history`를 바꾸고 `useSearchParams`는 그 주소를 읽는다.
 * ⚠️ **gate는 테스트 끝에서 전부 푼다** (POSTMORTEM 2026-09-18).
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), save: vi.fn(), prepare: vi.fn(), pr: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/app/(edit)/actions", () => ({
  saveTranslationKey: mocks.save, previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn(),
}));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: mocks.pr, prepareRepositorySync: mocks.prepare }));

import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";
import type { TranslationListRow } from "@/lib/keys/translation-list";
import { en } from "@/messages/en";
import { DEFAULT_TRANSLATION_QUERY } from "@/lib/translations/query";

import { props } from "./helpers/workspace-props";

const area = (container: HTMLElement, code: string) => container.querySelector<HTMLTextAreaElement>(`textarea[data-locale="${code}"]`);
const row = (container: HTMLElement, key: string) => [...container.querySelectorAll<HTMLElement>("[data-key-row]")].find(el => el.dataset.keyRow === key);
const rowIds = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-key-row]")].map(el => el.dataset.keyRow);
const panel = (container: HTMLElement, name: "list" | "detail") => container.querySelector<HTMLElement>(`[data-panel="${name}"]`)!;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === label);
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(el => el.textContent?.trim() === label)!;

function detailOf(keyId: string, over: Partial<{ pending: boolean }> = {}): NonNullable<WorkspaceProps["detail"]> {
  const base = props().detail as Exclude<WorkspaceProps["detail"], null | { absent: true }>;
  return { ...base, key: { ...base.key, id: keyId, key: `common.${keyId}` }, locales: base.locales.map(l => ({ ...l, ...(over.pending === undefined ? {} : { pending: over.pending }) })) };
}
const rowOf = (keyId: string): TranslationListRow => ({ keyId, surfaceSlug: "web", namespace: "common", key: `common.${keyId}`, sourceText: keyId, missingCount: 0, totalLocales: 3, hasPending: false, hasReview: false, isNew: false });

type Gate = { promise: Promise<void>; open: () => void };
const gates: Gate[] = [];
function gate(): Gate {
  let open = () => {};
  const promise = new Promise<void>(resolve => { open = resolve; });
  const entry = { promise, open };
  gates.push(entry);
  return entry;
}
function Wait({ on }: { on: Promise<void> | null }) { if (on !== null) use(on); return null; }

let respond: (href: string) => { next: WorkspaceProps; gate: Gate | null } = () => { throw new Error("no route"); };
/** 주소는 응답이 커밋될 때 바뀐다 — Next도 새 화면을 커밋한 뒤 history를 갱신한다. 대기 중의 주소는 옛 화면의 것이다. */
function Commit({ entry }: { entry: { how: "push" | "replace"; href: string } | null }) {
  useLayoutEffect(() => { if (entry !== null) window.history[entry.how === "push" ? "pushState" : "replaceState"](null, "", entry.href); }, [entry]);
  return null;
}
function Harness({ initial }: { initial: WorkspaceProps }) {
  const [state, setState] = useState<{ props: WorkspaceProps; wait: Promise<void> | null; entry: { how: "push" | "replace"; href: string } | null }>({ props: initial, wait: null, entry: null });
  const move = (how: "push" | "replace") => (href: string) => {
    const { next, gate } = respond(href);
    setState({ props: next, wait: gate?.promise ?? null, entry: { how, href } });
  };
  mocks.push.mockImplementation(move("push"));
  mocks.replace.mockImplementation(move("replace"));
  return (
    <Suspense fallback={<p data-fallback="true" />}>
      <Wait on={state.wait} />
      <Commit entry={state.entry} />
      <TranslationWorkspace {...state.props} />
      <FocusProbe />
    </Suspense>
  );
}
/*
  #158 — 커밋마다 **layout 단계 끝**의 포커스를 기록한다. 형제 순서상 워크스페이스의 layout effect 뒤, passive effect(`useEffect`) 앞이다 —
  브라우저는 그 사이에 칠할 수 있으므로 여기서 `body`면 사용자가 그 프레임을 본다. `act()`는 passive effect까지 비우므로 끝난 뒤의
  `activeElement`만 보면 이 틈을 못 잰다.
*/
const commitFocus: (Element | null)[] = [];
function FocusProbe() {
  useLayoutEffect(() => { commitFocus.push(document.activeElement); });
  return null;
}
const arrive = async (entry: Gate) => { await act(async () => { entry.open(); await entry.promise; }); };

const settles: (() => void)[] = [];
beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations?key=k1&keySurface=web");
});
afterEach(async () => {
  for (const entry of gates.splice(0)) await act(async () => entry.open());
  for (const settle of settles.splice(0)) await act(async () => settle());
  vi.restoreAllMocks();
});

// ── #7 · #33 ────────────────────────────────────────────────────────────────

it("키를 누르면 응답 전에 그 행이 선택되고 목록·상세가 busy다 — 이동은 replace다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const b = gate();
  respond = () => ({ next: { ...initial, query: { ...initial.query, key: "k2" }, detail: detailOf("k2") }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  // 짝 단언 — 이동 전에는 busy가 아니고 선택은 k1이다.
  expect(panel(container, "list").getAttribute("aria-busy")).toBeNull();
  expect(panel(container, "detail").querySelector("[data-skeleton-detail]")).toBeNull();
  expect(row(container, "k1")?.getAttribute("aria-current")).toBe("true");
  await user.click(row(container, "k2")!);
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  expect(mocks.push).not.toHaveBeenCalled();
  expect(row(container, "k2")?.getAttribute("aria-current")).toBe("true");
  expect(row(container, "k1")?.getAttribute("aria-current")).toBeNull();
  expect(panel(container, "list").getAttribute("aria-busy")).toBe("true");
  expect(panel(container, "detail").getAttribute("aria-busy")).toBe("true");
  // 옛 키(k1)의 값을 새 선택 옆에 세우지 않는다 — 응답까지 골격이다.
  expect(panel(container, "detail").querySelector("[data-skeleton-detail]")).not.toBeNull();
  expect(area(container, "en")).toBeNull();
  await arrive(b);
  expect(panel(container, "list").getAttribute("aria-busy")).toBeNull();
  expect(panel(container, "detail").getAttribute("aria-busy")).toBeNull();
  expect(panel(container, "detail").querySelector("[data-skeleton-detail]")).toBeNull();
  expect(row(container, "k2")?.getAttribute("aria-current")).toBe("true");
});

it("필터를 고르면 응답 전에 트리거 라벨이 바뀐다 — 필터는 push다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const b = gate();
  respond = () => ({ next: { ...initial, query: { ...initial.query, completion: "incomplete" }, list: { ...initial.list } }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  const trigger = () => container.querySelector<HTMLButtonElement>(`button[aria-label^="${en.translations.workspace.filters.state.axis}:"]`)!;
  expect(trigger().getAttribute("aria-label")).toBe(`${en.translations.workspace.filters.state.axis}: ${en.translations.workspace.filters.state.any}`);
  await user.click(trigger());
  await user.click(menuItem(en.translations.workspace.filters.state.incomplete));
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(trigger().getAttribute("aria-label")).toBe(`${en.translations.workspace.filters.state.axis}: ${en.translations.workspace.filters.state.incomplete}`);
  expect(panel(container, "list").getAttribute("aria-busy")).toBe("true");
  // 필터는 선택을 옮기지 않는다 — 상세는 같은 키라 골격으로 바꾸지 않는다.
  expect(panel(container, "detail").querySelector("[data-skeleton-detail]")).toBeNull();
  await arrive(b);
  expect(trigger().getAttribute("aria-label")).toBe(`${en.translations.workspace.filters.state.axis}: ${en.translations.workspace.filters.state.incomplete}`);
});

// ── #18 ─────────────────────────────────────────────────────────────────────

it("트리 클릭은 첫 키 예약값으로 한 번만 push하고, 응답이 고른 첫 키로 주소만 맞춘다 — 후속 이동이 없다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const b = gate();
  respond = () => ({ next: { ...initial, query: { ...initial.query, ns: "common", key: "k2", keySurface: "web" }, list: { ...initial.list }, detail: detailOf("k2") }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  const node = [...container.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent?.includes("common") && !el.closest("[data-key-row]"))!;
  await user.click(node);
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("key=%40first"));
  // 응답 전 — 누른 항목이 선택으로 서고, 상세는 골격이다(빈 상태로 번쩍이지도, 옛 키를 새 선택 옆에 세우지도 않는다).
  expect(node.getAttribute("aria-current")).toBe("true");
  expect(area(container, "zh")).toBeNull();
  expect(container.querySelector("[data-skeleton-detail]")).not.toBeNull();
  const replaceState = vi.spyOn(window.history, "replaceState");
  await arrive(b);
  // 트리 클릭은 그 노드가 범위다(translation-tree-range) — 누른 네임스페이스가 강조로 남는다.
  expect(node.getAttribute("aria-current")).toBe("true");
  expect(container.textContent).not.toContain(en.translations.workspace.detail.selectKey);
  expect(container.textContent).toContain("common.k2");
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(replaceState).toHaveBeenCalled();
  expect(window.location.search).toContain("key=k2");
  expect(window.location.search).not.toContain("first");
});

// ── translation-filter-scope T7 — 빈 상태 · 선택 행 스크롤 ─────────────────────

const treeNodeButton = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(el => !el.closest("[data-key-row]") && el.querySelector("span.min-w-0")?.textContent === label)!;

it("검색 0건 + 위치로 좁힌 검색의 Search all sources는 범위만 넓히고, 기다리는 동안 busy이며, 도착하면 목록 제목으로 착지한다 (조건 13)", async () => {
  const user = userEvent.setup();
  const base = props();
  const narrowedQuery = { ...base.query, scope: "source" as const, q: "zz", state: "review" as const, key: undefined, keySurface: undefined };
  const initial: WorkspaceProps = { ...base, query: narrowedQuery, detail: null, list: { ...base.list, rows: [], matchedKeyCount: 0, incompleteKeyCount: 0, selectedInResult: null } };
  const b = gate();
  respond = () => ({ next: { ...initial, query: { ...narrowedQuery, scope: "project" }, list: { ...base.list, rows: [rowOf("k7")], selectedInResult: null } }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  expect(button(en.translations.workspace.filters.clear)).toBeDefined();
  const searchAll = button(en.translations.workspace.empty.searchAll)!;
  await user.click(searchAll);
  expect(mocks.push).toHaveBeenCalledOnce();
  const next = new URL(mocks.push.mock.calls[0]![0] as string, "http://x").searchParams;
  expect(next.get("scope")).toBeNull();
  expect(next.get("q")).toBe("zz");
  expect(next.get("state")).toBe("review");
  expect(searchAll.getAttribute("aria-busy")).toBe("true");
  // 대기 중에도 누른 버튼이 같은 라벨로 남는다 — 표시는 빈 문구와 같은 서버 쿼리다(TFS r2 🔴1).
  expect(searchAll.isConnected).toBe(true);
  expect(searchAll.textContent?.trim()).toBe(en.translations.workspace.empty.searchAll);
  expect(document.activeElement).toBe(searchAll);
  await arrive(b);
  expect(rowIds(container)).toEqual(["k7"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(panel(container, "list").querySelector("h2"));
});

it("전 소스 검색 0건 + Status가 켜졌으면 주 버튼은 Clear search, 보조 버튼은 Clear filters이고 검색어를 남긴다 (조건 13)", async () => {
  const user = userEvent.setup();
  const base = props();
  const query = { ...base.query, q: "zz", scope: "project" as const, completion: "incomplete" as const, key: undefined, keySurface: undefined };
  const initial: WorkspaceProps = { ...base, query, detail: null, list: { ...base.list, rows: [], matchedKeyCount: 0, incompleteKeyCount: 0, selectedInResult: null } };
  respond = () => ({ next: initial, gate: null });
  const { container } = await render(<Harness initial={initial} />);
  // 목록 머리에 Status 트리거가 있다 — 빈 상태 안의 버튼만 본다.
  const emptyButtons = () => [...panel(container, "list").querySelectorAll<HTMLButtonElement>("[data-list-empty] button")].map(b => b.textContent?.trim());
  expect(emptyButtons()).toEqual([en.translations.workspace.empty.clearSearch, en.translations.workspace.filters.clear]);
  await user.click([...panel(container, "list").querySelectorAll<HTMLButtonElement>("[data-list-empty] button")][1]!);
  const next = new URL(mocks.push.mock.calls[0]![0] as string, "http://x").searchParams;
  expect(next.get("q")).toBe("zz");
  expect(next.get("completion")).toBeNull();
});

/*
  TFS r2 🔴1 — 버튼을 낙관값으로 고르면 `Show all`을 누른 순간 좁힘이 풀려 버튼이 사라지고 포커스가 body로 빠졌다. 누른 버튼은 도착까지
  같은 자리에 busy로 남고 포커스를 지킨다(DESIGN §6.1a).
*/
it.each([
  ["주 버튼 Clear filters(검색어 없음 · Status)", { state: "review" as const }, 0],
  ["보조 버튼 Clear filters(검색어 + Status)", { q: "zz", completion: "incomplete" as const }, 1],
])("%s는 대기 중에도 busy로 남고 포커스를 지킨다", async (_name, over, index) => {
  const user = userEvent.setup();
  const base = props();
  const query = { ...base.query, ...over, key: undefined, keySurface: undefined };
  const initial: WorkspaceProps = { ...base, query, detail: null, list: { ...base.list, rows: [], matchedKeyCount: 0, incompleteKeyCount: 0, selectedInResult: null } };
  const b = gate();
  respond = href => ({ next: { ...initial, query: { ...DEFAULT_TRANSLATION_QUERY, ...(new URL(href, "http://x").searchParams.get("q") === null ? {} : { q: "zz" }) }, list: { ...base.list, rows: [rowOf("k7")], selectedInResult: null } }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  const pressed = [...panel(container, "list").querySelectorAll<HTMLButtonElement>("[data-list-empty] button")][index]!;
  const label = pressed.textContent;
  await user.click(pressed);
  expect(mocks.push).toHaveBeenCalledOnce();
  expect(pressed.isConnected).toBe(true);
  expect(pressed.textContent).toBe(label);
  expect(pressed.getAttribute("aria-busy")).toBe("true");
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(pressed);
  commitFocus.length = 0;
  await arrive(b);
  // #158 — 버튼을 지우는 도착 커밋에서 이미 목록 제목이다. passive effect까지 기다리면 그 사이 칠해진 프레임이 `body`였다(5,000행에서 3.3초).
  expect(pressed.isConnected).toBe(false);
  expect(commitFocus.length).toBeGreaterThan(0);
  expect(commitFocus[0]).not.toBe(document.body);
  expect(commitFocus[0]).toBe(panel(container, "list").querySelector("h2"));
  expect(document.activeElement).toBe(panel(container, "list").querySelector("h2"));
});

it("마운트 착지는 선택 행으로 스크롤한다 — 딥링크·새로고침", async () => {
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  const base = props();
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, key: "k2" }} detail={detailOf("k2")} />);
  expect(scroll).toHaveBeenCalledOnce();
  expect(scroll.mock.contexts[0]).toBe(container.querySelector('[data-key-row="k2"]'));
  expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
});

it("트리 이동은 도착한 선택 행으로 스크롤하고, 대기 중에는 스크롤도 @first 주소 교체도 하지 않는다 (조건 4)", async () => {
  const user = userEvent.setup();
  const initial = props();
  const b = gate();
  respond = () => ({ next: { ...initial, query: { ...initial.query, ns: "common", key: "k2", keySurface: "web" }, list: { ...initial.list }, detail: detailOf("k2") }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  // 목록 행의 스크롤만 센다 — 트리는 위치가 바뀌면 그 노드를 보이게 한다(`nearest`, 이미 보이면 무동작).
  const rowScrolls = () => scroll.mock.contexts.filter(el => el instanceof HTMLElement && el.dataset.keyRow !== undefined);
  const replaceState = vi.spyOn(window.history, "replaceState");
  await user.click(treeNodeButton(container, "common"));
  expect(rowScrolls()).toEqual([]);
  expect(replaceState).not.toHaveBeenCalled();
  await arrive(b);
  expect(rowScrolls()).toEqual([container.querySelector('[data-key-row="k2"]')]);
  expect(replaceState).toHaveBeenCalled();
});

it("목록에서 직접 누른 행은 스크롤하지 않는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  respond = () => ({ next: { ...initial, query: { ...initial.query, key: "k2" }, detail: detailOf("k2") }, gate: null });
  const { container } = await render(<Harness initial={initial} />);
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  await user.click(row(container, "k2")!);
  expect(mocks.replace).toHaveBeenCalledOnce();
  // 도착한 커밋까지 기다린 뒤 본다 — 스크롤 effect는 그 커밋에 돈다.
  await vi.waitFor(() => expect(container.textContent).toContain("common.k2"));
  expect(scroll).not.toHaveBeenCalled();
});

it("미저장 draft가 있으면 트리 이동 전에 확인창이 서고, 취소하면 이동도 스크롤도 없다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const { container } = await render(<Harness initial={initial} />);
  await user.type(area(container, "zh")!, "空");
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  await user.click(treeNodeButton(container, "common"));
  expect(button("Keep editing")).toBeDefined();
  await user.click(button("Keep editing")!);
  expect(mocks.push).not.toHaveBeenCalled();
  expect(scroll).not.toHaveBeenCalled();
});

// ── #16 ─────────────────────────────────────────────────────────────────────

it("상세의 언어 필터는 서버로 가지 않고 주소만 바꾸며, 다음 키 이동이 그 언어를 잇는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  respond = () => ({ next: { ...initial, query: { ...initial.query, key: "k2", language: "ko" }, detail: detailOf("k2") }, gate: null });
  const { container } = await render(<Harness initial={initial} />);
  // 짝 단언 — 전 언어가 보인다.
  expect([...container.querySelectorAll("textarea")].map(t => t.dataset.locale)).toEqual(["en", "ko", "zh"]);
  await user.click(container.querySelector<HTMLButtonElement>('button[aria-label^="Languages:"]')!);
  await user.click(menuItem("ko"));
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(window.location.search).toContain("language=ko");
  expect([...container.querySelectorAll("textarea")].map(t => t.dataset.locale)).toEqual(["en", "ko"]);
  await user.click(row(container, "k2")!);
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("language=ko"));
});

// ── #19 → 전량 목록 (translation-filter-scope T6) ───────────────────────────

/*
  POSTMORTEM 2026-09-23의 두 회귀를 전량 목록 형으로 옮긴다 — More가 사라져 재검증 응답이 곧 조건의 전부다.
  서버 목록에 남은 행은 Saved가 되지 않고, 빠진 행은 선택 여부와 무관하게 자리에 남아 Saved다.
*/
it("재검증 목록에 남은 행은 Saved가 되지 않는다", async () => {
  const initial = props();
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await rerender(<TranslationWorkspace {...initial} list={{ ...initial.list }} />);
  expect(rowIds(container)).toEqual(["k1", "k2"]);
  expect(row(container, "k2")?.textContent).not.toContain("Saved");
  expect(container.textContent).not.toContain("+1 saved");
});

it("선택 키가 조건을 벗어나면 재검증이 그 행을 Saved로 남기고, 남은 행은 새 요약으로 바뀐다", async () => {
  const initial = props({ query: { ...props().query, key: "k2" }, detail: detailOf("k2") });
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  await rerender(<TranslationWorkspace {...initial} list={{ ...initial.list, rows: [{ ...initial.list.rows[0]!, missingCount: 2 }], selectedInResult: false }} />);
  expect(row(container, "k2")?.textContent).toContain("Saved");
  expect(row(container, "k1")?.textContent).toContain("2 untranslated");
});

it("목록에 More 버튼이 없다 — 화면 목록은 전량이다", async () => {
  const initial = props();
  const { container } = await render(<TranslationWorkspace {...initial} list={{ ...initial.list, nextCursor: "c1" }} />);
  expect([...container.querySelectorAll("button")].some(b => /more keys/i.test(b.textContent ?? ""))).toBe(false);
});

// ── #29 ─────────────────────────────────────────────────────────────────────

it("조건이 바뀐 첫 커밋부터 새 행이다 — 새 라벨 아래 옛 행이 한 프레임도 서지 않는다", async () => {
  const initial = props();
  const frames: { title: string; rows: (string | undefined)[] }[] = [];
  let host: HTMLElement | null = null;
  // 목록 제목은 고정(`Keys`)이라 키 목록 머리의 Status 라벨로 조건을 잰다 — 서버 조건이 그대로 서는 재렌더라 낙관값이 아니다.
  const onRender = () => { if (host !== null) frames.push({ title: host.querySelector(`[data-panel=list] button[aria-label^="${en.translations.workspace.filters.state.axis}:"]`)?.getAttribute("aria-label") ?? "", rows: rowIds(host) }); };
  const { container, rerender } = await render(<Profiler id="w" onRender={onRender}><TranslationWorkspace {...initial} /></Profiler>);
  host = container;
  await rerender(<Profiler id="w" onRender={onRender}><TranslationWorkspace {...initial} query={{ ...initial.query, completion: "incomplete" }} list={{ ...initial.list, rows: [rowOf("k9")] }} /></Profiler>);
  const titled = frames.filter(f => f.title === `${en.translations.workspace.filters.state.axis}: ${en.translations.workspace.filters.state.incomplete}`);
  // 짝 단언 — 새 조건의 프레임이 실제로 있다.
  expect(titled.length).toBeGreaterThan(0);
  expect(titled.every(f => f.rows.join() === "k9")).toBe(true);
});

// ── #20 · #30 ───────────────────────────────────────────────────────────────

it("전송 중인 셀은 Saving…이고, 보낸 뒤 더 친 셀은 Not saved로 남는다", async () => {
  const user = userEvent.setup();
  let settle: (value: unknown) => void = () => {};
  mocks.save.mockReturnValue(new Promise(resolve => { settle = resolve; }));
  settles.push(() => settle({ ok: true, keyId: "k1", cells: [] }));
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.type(area(container, "zh")!, "空");
  await user.clear(area(container, "ko")!);
  await user.type(area(container, "ko")!, "새");
  const status = (code: string) => area(container, code)!.closest("div.flex.shrink-0")?.textContent ?? "";
  expect(status("zh")).toContain(en.translations.workspace.detail.notSaved);
  await user.click(button(en.translations.workspace.footer.save)!);
  expect(status("zh")).toContain(en.translations.workspace.detail.saving);
  expect(status("zh")).not.toContain(en.translations.workspace.detail.notSaved);
  // 보낸 뒤 친 입력은 이번 요청에 없다 — Saving…이 아니다.
  await user.type(area(container, "ko")!, "!");
  expect(status("ko")).toContain(en.translations.workspace.detail.notSaved);
  expect(status("ko")).not.toContain(en.translations.workspace.detail.saving);
  // 이 테스트는 전송 중 표시만 본다 — 성공 확정은 아래에서 본다.
  await act(async () => settle({ ok: true, keyId: "k1", cells: [{ localeCode: "zh", value: "空" }, { localeCode: "ko", value: "새" }] }));
  expect(status("zh")).not.toContain(en.translations.workspace.detail.saving);
});

it("저장 성공의 첫 표시부터 Saved · not sent이고, 저장한 셀에 Not sent가 선다 — 서버 상세를 기다리지 않는다", async () => {
  const user = userEvent.setup();
  mocks.save.mockResolvedValue({ ok: true, keyId: "k1", cells: [{ localeCode: "zh", value: "空" }] });
  const { container } = await render(<TranslationWorkspace {...props({ detail: detailOf("k1", { pending: false }) })} />);
  const cell = () => area(container, "zh")!.closest("div.flex.shrink-0")?.textContent ?? "";
  // 짝 단언 — 저장 전에는 그 셀에 보낼 것이 없다.
  expect(cell()).not.toContain(en.translations.workspace.list.notSent);
  await user.type(area(container, "zh")!, "空");
  await user.click(button(en.translations.workspace.footer.save)!);
  const result = container.querySelector("[data-footer-result]");
  expect(result?.textContent).toBe(en.translations.workspace.footer.savedNotSent);
  expect(cell()).toContain(en.translations.workspace.list.notSent);
});

// ── SyncButton 표면 ──────────────────────────────────────────────────────────

it("번역 화면의 Sync 확인창이 권하는 Publish 링크는 지금 소스를 가리킨다 — 옛 경로로 우회하지 않는다", async () => {
  const user = userEvent.setup();
  mocks.pr.mockResolvedValue(null);
  mocks.prepare.mockResolvedValue({ approval: "digest-1", unsent: 1 });
  await render(<TranslationWorkspace {...props({ routeSurfaceSlug: "app", detail: null, query: { ...props().query, key: undefined, keySurface: undefined } })} />);
  await act(async () => user.click(button("Sync")!));
  const link = [...document.querySelectorAll<HTMLAnchorElement>("a")].find(a => a.textContent === en.repositorySync.sendFirst);
  expect(link?.getAttribute("href")).toBe("/projects/acme/surfaces/app/translations");
});

// ── fix r1 ──────────────────────────────────────────────────────────────────

/*
  ⚠️ **대기 중의 두 번째 조작은 낙관값 위에 쌓는다** (POSTMORTEM 2026-09-12 부류) — 트리거가 누른 값으로 먼저 서므로 사용자는 다음 축을
  바로 고른다. 그 주소를 서버 prop(`query`)으로 조립하면 첫 선택이 조용히 되돌아간다.
*/
it("응답 전에 Status와 검색을 잇달아 고르면 둘째 이동이 첫 선택을 싣는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  respond = () => ({ next: initial, gate: gate() });
  const { container } = await render(<Harness initial={initial} />);
  await user.click(container.querySelector<HTMLButtonElement>(`button[aria-label^="${en.translations.workspace.filters.state.axis}:"]`)!);
  await user.click(menuItem(en.translations.workspace.filters.state.incomplete));
  await user.type(container.querySelector<HTMLInputElement>('input[type="search"]')!, "zz{Enter}");
  expect(mocks.push).toHaveBeenCalledTimes(2);
  // 짝 — 첫 이동은 Status만, 둘째는 둘 다.
  expect(mocks.push.mock.calls[0]?.[0]).toContain("completion=incomplete");
  expect(mocks.push.mock.calls[0]?.[0]).not.toContain("q=");
  expect(mocks.push.mock.calls[1]?.[0]).toContain("completion=incomplete");
  expect(mocks.push.mock.calls[1]?.[0]).toContain("q=zz");
});

it("응답 전에 키를 고른 뒤 필터를 고르면 필터 이동이 새 키를 잇는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  respond = () => ({ next: initial, gate: gate() });
  const { container } = await render(<Harness initial={initial} />);
  await user.click(row(container, "k2")!);
  await user.click(container.querySelector<HTMLButtonElement>(`button[aria-label^="${en.translations.workspace.filters.state.axis}:"]`)!);
  await user.click(menuItem(en.translations.workspace.filters.state.unsent));
  expect(mocks.push.mock.calls[0]?.[0]).toContain("key=k2");
});

/*
  ⚠️ **`history.replaceState`는 대기 중인 이동을 버린다** (Next 16.3 — ACTION_RESTORE가 pending navigation을 대체한다). 옛 상세의
  언어 메뉴는 읽기 전용 잠금 밖이라 키 이동을 기다리는 동안 바꾸면 그 이동이 사라졌다.
*/
// 키·트리 이동 동안은 상세가 골격이라 메뉴가 없다 — 옛 상세가 남는 이동(필터·검색)에서 잠긴다.
it("검색 이동을 기다리는 동안 언어 메뉴가 잠기고, 도착하면 풀린다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const b = gate();
  respond = () => ({ next: { ...initial, query: { ...initial.query, q: "save" } }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  const languages = () => container.querySelector<HTMLButtonElement>('button[aria-label^="Languages:"]')!;
  // 짝 — 대기 전에는 열 수 있다.
  expect(languages().disabled).toBe(false);
  await user.type(container.querySelector<HTMLInputElement>('input[type="search"]')!, "save{Enter}");
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(languages().disabled).toBe(true);
  await arrive(b);
  expect(languages().disabled).toBe(false);
});


/*
  Status 트리거는 응답마다 본문이 바뀌는(`aria-busy`) 목록 패널 안에 있다 — 메뉴를 닫은 포커스가 트리거로 돌아온 뒤, 0건 응답이 목록을 빈 상태로
  바꾸는 커밋까지 한 번도 `body`로 빠지지 않는다(#158의 커밋 단위 측정).
*/
it("Status를 고르면 도착(0건 빈 상태 포함)까지 모든 커밋에서 포커스가 트리거에 있다", async () => {
  /*
    ⚠️ jsdom에는 focus fixup이 없다(POSTMORTEM 2026-09-20) — 포커스된 트리거가 `disabled`가 되어도 `activeElement`가 남는다. 브라우저처럼 `body`로 돌린다.
  */
  const fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    active.removeAttribute("disabled");
    active.blur();
    active.setAttribute("disabled", "");
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
  settles.push(() => fixup.disconnect());
  const user = userEvent.setup();
  const initial = props();
  const b = gate();
  respond = () => ({ next: { ...initial, query: { ...initial.query, state: "unsent" }, list: { ...initial.list, rows: [], matchedKeyCount: 0, incompleteKeyCount: 0, selectedInResult: false } }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  const trigger = () => container.querySelector<HTMLButtonElement>(`[data-panel="list"] button[aria-label^="${en.translations.workspace.filters.state.axis}:"]`)!;
  await user.click(trigger());
  await user.click(menuItem(en.translations.workspace.filters.state.unsent));
  expect(mocks.push).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(trigger());
  commitFocus.length = 0;
  await arrive(b);
  expect(container.querySelector("[data-list-empty]")).not.toBeNull();
  expect(commitFocus.length).toBeGreaterThan(0);
  expect(commitFocus.filter(el => el === document.body || el === null)).toEqual([]);
  expect(document.activeElement).toBe(trigger());
});
