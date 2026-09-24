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
 * ⚠️ **gate와 More 응답은 테스트 끝에서 전부 푼다** (POSTMORTEM 2026-09-18).
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), save: vi.fn(), more: vi.fn(), prepare: vi.fn(), pr: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/app/(edit)/actions", () => ({
  saveTranslationKey: mocks.save, previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn(), loadMoreTranslationKeys: mocks.more,
}));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: mocks.pr, prepareRepositorySync: mocks.prepare }));

import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";
import type { TranslationListRow } from "@/lib/keys/translation-list";
import { m } from "@/lib/i18n";

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
    </Suspense>
  );
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
  expect(row(container, "k1")?.getAttribute("aria-current")).toBe("true");
  await user.click(row(container, "k2")!);
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  expect(mocks.push).not.toHaveBeenCalled();
  expect(row(container, "k2")?.getAttribute("aria-current")).toBe("true");
  expect(row(container, "k1")?.getAttribute("aria-current")).toBeNull();
  expect(panel(container, "list").getAttribute("aria-busy")).toBe("true");
  expect(panel(container, "detail").getAttribute("aria-busy")).toBe("true");
  await arrive(b);
  expect(panel(container, "list").getAttribute("aria-busy")).toBeNull();
  expect(panel(container, "detail").getAttribute("aria-busy")).toBeNull();
  expect(row(container, "k2")?.getAttribute("aria-current")).toBe("true");
});

it("필터를 고르면 응답 전에 트리거 라벨이 바뀐다 — 필터는 push다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const b = gate();
  respond = () => ({ next: { ...initial, query: { ...initial.query, completion: "incomplete" }, list: { ...initial.list } }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  const trigger = () => container.querySelector<HTMLButtonElement>('button[aria-label^="Completeness:"]')!;
  expect(trigger().getAttribute("aria-label")).toBe("Completeness: All keys");
  await user.click(trigger());
  await user.click(menuItem(m.translations.workspace.filters.completion.incomplete));
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(trigger().getAttribute("aria-label")).toBe(`Completeness: ${m.translations.workspace.filters.completion.incomplete}`);
  expect(panel(container, "list").getAttribute("aria-busy")).toBe("true");
  await arrive(b);
  expect(trigger().getAttribute("aria-label")).toBe(`Completeness: ${m.translations.workspace.filters.completion.incomplete}`);
});

// ── #18 ─────────────────────────────────────────────────────────────────────

it("트리 클릭은 첫 키 예약값으로 한 번만 push하고, 응답이 고른 첫 키로 주소만 맞춘다 — 후속 이동이 없다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const b = gate();
  respond = () => ({ next: { ...initial, query: { ...initial.query, ns: "common", scope: "namespace", key: "k2", keySurface: "web" }, list: { ...initial.list }, detail: detailOf("k2") }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  const node = [...container.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent?.includes("common") && !el.closest("[data-key-row]"))!;
  await user.click(node);
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("key=%40first"));
  // 응답 전 — 누른 항목이 선택으로 서고, 옛 상세는 읽기 전용으로 남는다(빈 상태로 번쩍이지 않는다).
  expect(node.getAttribute("aria-current")).toBe("true");
  expect(area(container, "zh")?.readOnly).toBe(true);
  const replaceState = vi.spyOn(window.history, "replaceState");
  await arrive(b);
  expect(container.textContent).not.toContain(m.translations.workspace.detail.selectKey);
  expect(container.textContent).toContain("common.k2");
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(replaceState).toHaveBeenCalled();
  expect(window.location.search).toContain("key=k2");
  expect(window.location.search).not.toContain("first");
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

// ── #19 ─────────────────────────────────────────────────────────────────────

it("More는 주소를 바꾸지 않고 다음 페이지를 붙이며, 기다리는 동안 버튼이 loading이다", async () => {
  const user = userEvent.setup();
  const initial = props();
  let settle: (value: unknown) => void = () => {};
  mocks.more.mockReturnValue(new Promise(resolve => { settle = resolve; }));
  settles.push(() => settle({ ok: false, error: "late" }));
  respond = () => ({ next: { ...initial, query: { ...initial.query, key: "k3" }, detail: detailOf("k3") }, gate: null });
  const { container } = await render(<Harness initial={{ ...initial, list: { ...initial.list, nextCursor: "c1" } }} />);
  await user.click(button(m.translations.workspace.list.more)!);
  expect(mocks.more).toHaveBeenCalledExactlyOnceWith({ slug: "acme", surfaceSlug: "web", query: expect.objectContaining({ key: "k1" }), cursor: "c1" });
  expect(button(m.translations.workspace.list.more)?.disabled).toBe(true);
  // 연타는 요청을 늘리지 않는다.
  await user.click(button(m.translations.workspace.list.more)!);
  expect(mocks.more).toHaveBeenCalledTimes(1);
  await act(async () => settle({ ok: true, rows: [rowOf("k3")], nextCursor: null }));
  expect(rowIds(container)).toEqual(["k1", "k2", "k3"]);
  expect(button(m.translations.workspace.list.more)).toBeUndefined();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(window.location.search).not.toContain("cursor");
  await user.click(row(container, "k3")!);
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  expect(mocks.replace.mock.calls[0]?.[0]).not.toContain("cursor");
});

it("More가 실패하면 버튼이 돌아오고 이유를 한 줄로 말한다", async () => {
  const user = userEvent.setup();
  mocks.more.mockResolvedValue({ ok: false, error: "unavailable" });
  const initial = props();
  const { container } = await render(<TranslationWorkspace {...initial} list={{ ...initial.list, nextCursor: "c1" }} />);
  await user.click(button(m.translations.workspace.list.more)!);
  expect(button(m.translations.workspace.list.more)?.disabled).toBe(false);
  expect(container.textContent).toContain(m.translations.workspace.list.moreFailed);
  expect(rowIds(container)).toEqual(["k1", "k2"]);
});

it("조건이 바뀐 뒤 도착한 More 응답은 버린다 — 옛 조건의 행을 새 목록에 붙이지 않는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  let settle: (value: unknown) => void = () => {};
  mocks.more.mockReturnValue(new Promise(resolve => { settle = resolve; }));
  const { container, rerender } = await render(<TranslationWorkspace {...initial} list={{ ...initial.list, nextCursor: "c1" }} />);
  await user.click(button(m.translations.workspace.list.more)!);
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, q: "save" }} list={{ ...initial.list, rows: [initial.list.rows[1]!], nextCursor: null }} />);
  await act(async () => settle({ ok: true, rows: [rowOf("k3")], nextCursor: null }));
  expect(rowIds(container)).toEqual(["k2"]);
});

/*
  POSTMORTEM 2026-09-23의 두 회귀를 cursor 없는 형으로 옮긴다 — 재검증은 이제 언제나 첫 페이지다.
  페이지 밖(More로 붙인) 행은 부재가 조건 이탈의 증거가 아니고, 선택 키의 이탈만 서버 판정(`selectedInResult`)으로 Saved가 된다.
*/
it("More로 붙인 행은 첫 페이지 재검증에서 Saved가 되지 않는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const first = { ...initial.list, rows: [initial.list.rows[0]!], nextCursor: "c1" };
  mocks.more.mockResolvedValue({ ok: true, rows: [initial.list.rows[1]!], nextCursor: null });
  const { container, rerender } = await render(<TranslationWorkspace {...initial} list={first} />);
  await user.click(button(m.translations.workspace.list.more)!);
  expect(rowIds(container)).toEqual(["k1", "k2"]);
  await rerender(<TranslationWorkspace {...initial} list={{ ...first }} />);
  expect(rowIds(container)).toEqual(["k1", "k2"]);
  expect(row(container, "k2")?.textContent).not.toContain("Saved");
  expect(container.textContent).not.toContain("+1 saved");
  // 첫 페이지가 cursor를 새로 줘도 이미 붙인 페이지 뒤를 잇는다 — 첫 페이지의 다음을 다시 붙이지 않는다.
  expect(button(m.translations.workspace.list.more)).toBeUndefined();
});

it("More로 붙인 선택 키가 조건을 벗어나면 재검증이 그 행만 Saved로 남긴다", async () => {
  const user = userEvent.setup();
  const initial = props({ query: { ...props().query, key: "k2" }, detail: detailOf("k2") });
  const first = { ...initial.list, rows: [initial.list.rows[0]!], nextCursor: "c1" };
  mocks.more.mockResolvedValue({ ok: true, rows: [initial.list.rows[1]!], nextCursor: null });
  const { container, rerender } = await render(<TranslationWorkspace {...initial} list={first} />);
  await user.click(button(m.translations.workspace.list.more)!);
  await rerender(<TranslationWorkspace {...initial} list={{ ...first, rows: [{ ...initial.list.rows[0]!, missingCount: 2 }], selectedInResult: false }} />);
  expect(row(container, "k2")?.textContent).toContain("Saved");
  expect(row(container, "k1")?.textContent).toContain("2 missing");
});

// ── #29 ─────────────────────────────────────────────────────────────────────

it("조건이 바뀐 첫 커밋부터 새 행이다 — 새 라벨 아래 옛 행이 한 프레임도 서지 않는다", async () => {
  const initial = props();
  const frames: { title: string; rows: (string | undefined)[] }[] = [];
  let host: HTMLElement | null = null;
  const onRender = () => { if (host !== null) frames.push({ title: host.querySelector("[data-panel=list] h2")?.textContent ?? "", rows: rowIds(host) }); };
  const { container, rerender } = await render(<Profiler id="w" onRender={onRender}><TranslationWorkspace {...initial} /></Profiler>);
  host = container;
  await rerender(<Profiler id="w" onRender={onRender}><TranslationWorkspace {...initial} query={{ ...initial.query, completion: "incomplete" }} list={{ ...initial.list, rows: [rowOf("k9")] }} /></Profiler>);
  const titled = frames.filter(f => f.title === m.translations.workspace.list.incompleteKeys);
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
  expect(status("zh")).toContain(m.translations.workspace.detail.notSaved);
  await user.click(button(m.translations.workspace.footer.save)!);
  expect(status("zh")).toContain(m.translations.workspace.detail.saving);
  expect(status("zh")).not.toContain(m.translations.workspace.detail.notSaved);
  // 보낸 뒤 친 입력은 이번 요청에 없다 — Saving…이 아니다.
  await user.type(area(container, "ko")!, "!");
  expect(status("ko")).toContain(m.translations.workspace.detail.notSaved);
  expect(status("ko")).not.toContain(m.translations.workspace.detail.saving);
  // 이 테스트는 전송 중 표시만 본다 — 성공 확정은 아래에서 본다.
  await act(async () => settle({ ok: true, keyId: "k1", cells: [{ localeCode: "zh", value: "空" }, { localeCode: "ko", value: "새" }] }));
  expect(status("zh")).not.toContain(m.translations.workspace.detail.saving);
});

it("저장 성공의 첫 표시부터 Saved · not sent이고, 저장한 셀에 Not sent가 선다 — 서버 상세를 기다리지 않는다", async () => {
  const user = userEvent.setup();
  mocks.save.mockResolvedValue({ ok: true, keyId: "k1", cells: [{ localeCode: "zh", value: "空" }] });
  const { container } = await render(<TranslationWorkspace {...props({ detail: detailOf("k1", { pending: false }) })} />);
  const cell = () => area(container, "zh")!.closest("div.flex.shrink-0")?.textContent ?? "";
  // 짝 단언 — 저장 전에는 그 셀에 보낼 것이 없다.
  expect(cell()).not.toContain(m.translations.workspace.list.notSent);
  await user.type(area(container, "zh")!, "空");
  await user.click(button(m.translations.workspace.footer.save)!);
  const result = container.querySelector("[data-footer-result]");
  expect(result?.textContent).toBe(m.translations.workspace.footer.savedNotSent);
  expect(cell()).toContain(m.translations.workspace.list.notSent);
});

// ── SyncButton 표면 ──────────────────────────────────────────────────────────

it("번역 화면의 Sync 확인창이 권하는 Publish 링크는 지금 소스를 가리킨다 — 옛 경로로 우회하지 않는다", async () => {
  const user = userEvent.setup();
  mocks.pr.mockResolvedValue(null);
  mocks.prepare.mockResolvedValue({ approval: "digest-1", unsent: 1 });
  await render(<TranslationWorkspace {...props({ routeSurfaceSlug: "app", detail: null, query: { ...props().query, key: undefined, keySurface: undefined } })} />);
  await act(async () => user.click(button("Sync")!));
  const link = [...document.querySelectorAll<HTMLAnchorElement>("a")].find(a => a.textContent === m.repositorySync.sendFirst);
  expect(link?.getAttribute("href")).toBe("/projects/acme/surfaces/app/translations");
});

// ── fix r1 ──────────────────────────────────────────────────────────────────

/*
  ⚠️ **대기 중의 두 번째 조작은 낙관값 위에 쌓는다** (POSTMORTEM 2026-09-12 부류) — 트리거가 누른 값으로 먼저 서므로 사용자는 다음 축을
  바로 고른다. 그 주소를 서버 prop(`query`)으로 조립하면 첫 선택이 조용히 되돌아간다.
*/
it("응답 전에 두 축을 잇달아 고르면 둘째 이동이 첫 선택을 싣는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  respond = () => ({ next: initial, gate: gate() });
  const { container } = await render(<Harness initial={initial} />);
  await user.click(container.querySelector<HTMLButtonElement>('button[aria-label^="Completeness:"]')!);
  await user.click(menuItem(m.translations.workspace.filters.completion.incomplete));
  await user.click(container.querySelector<HTMLButtonElement>('button[aria-label^="State:"]')!);
  await user.click(menuItem(m.translations.workspace.filters.state.unsent));
  expect(mocks.push).toHaveBeenCalledTimes(2);
  // 짝 — 첫 이동은 첫 축만, 둘째는 둘 다.
  expect(mocks.push.mock.calls[0]?.[0]).toContain("completion=incomplete");
  expect(mocks.push.mock.calls[0]?.[0]).not.toContain("state=");
  expect(mocks.push.mock.calls[1]?.[0]).toContain("completion=incomplete");
  expect(mocks.push.mock.calls[1]?.[0]).toContain("state=unsent");
});

it("응답 전에 키를 고른 뒤 필터를 고르면 필터 이동이 새 키를 잇는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  respond = () => ({ next: initial, gate: gate() });
  const { container } = await render(<Harness initial={initial} />);
  await user.click(row(container, "k2")!);
  await user.click(container.querySelector<HTMLButtonElement>('button[aria-label^="State:"]')!);
  await user.click(menuItem(m.translations.workspace.filters.state.unsent));
  expect(mocks.push.mock.calls[0]?.[0]).toContain("key=k2");
});

/*
  ⚠️ **`history.replaceState`는 대기 중인 이동을 버린다** (Next 16.3 — ACTION_RESTORE가 pending navigation을 대체한다). 옛 상세의
  언어 메뉴는 읽기 전용 잠금 밖이라 키 이동을 기다리는 동안 바꾸면 그 이동이 사라졌다.
*/
it("키 이동을 기다리는 동안 언어 메뉴가 잠기고, 도착하면 풀린다", async () => {
  const user = userEvent.setup();
  const initial = props();
  const b = gate();
  respond = () => ({ next: { ...initial, query: { ...initial.query, key: "k2" }, detail: detailOf("k2") }, gate: b });
  const { container } = await render(<Harness initial={initial} />);
  const languages = () => container.querySelector<HTMLButtonElement>('button[aria-label^="Languages:"]')!;
  // 짝 — 대기 전에는 열 수 있다.
  expect(languages().disabled).toBe(false);
  await user.click(row(container, "k2")!);
  expect(languages().disabled).toBe(true);
  await arrive(b);
  expect(languages().disabled).toBe(false);
});

it.each([
  ["archived", (): string => m.translations.workspace.footer.archived],
  ["not-found", (): string => m.translations.workspace.footer.lostAccess],
  ["forbidden", (): string => m.translations.workspace.footer.lostAccess],
] as const)("More의 %s 거부는 그 상태를 말하고 편집기를 잠근다 — 일반 재시도 문구가 아니다", async (error, text) => {
  const user = userEvent.setup();
  mocks.more.mockResolvedValue({ ok: false, error });
  const initial = props();
  const { container } = await render(<TranslationWorkspace {...initial} list={{ ...initial.list, nextCursor: "c1" }} />);
  await user.click(button(m.translations.workspace.list.more)!);
  expect(container.textContent).toContain(text());
  expect(container.textContent).not.toContain(m.translations.workspace.list.moreFailed);
  expect(area(container, "zh")?.readOnly).toBe(true);
});

it("More 실패 문구는 조건이 바뀌면 사라지고, 옛 조건의 늦은 실패는 새 목록에 서지 않는다", async () => {
  const user = userEvent.setup();
  const initial = props();
  mocks.more.mockResolvedValueOnce({ ok: false, error: "unavailable" });
  const { container, rerender } = await render(<TranslationWorkspace {...initial} list={{ ...initial.list, nextCursor: "c1" }} />);
  await user.click(button(m.translations.workspace.list.more)!);
  expect(container.textContent).toContain(m.translations.workspace.list.moreFailed);
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, q: "save" }} list={{ ...initial.list, nextCursor: "c2" }} />);
  expect(container.textContent).not.toContain(m.translations.workspace.list.moreFailed);
  // 새 조건에서 More를 누르고, 응답 전에 조건이 또 바뀐 뒤 실패가 온다.
  let settle: (value: unknown) => void = () => {};
  mocks.more.mockReturnValueOnce(new Promise(resolve => { settle = resolve; }));
  await user.click(button(m.translations.workspace.list.more)!);
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, q: "other" }} list={{ ...initial.list, nextCursor: "c3" }} />);
  await act(async () => settle({ ok: false, error: "unavailable" }));
  expect(container.textContent).not.toContain(m.translations.workspace.list.moreFailed);
  expect(button(m.translations.workspace.list.more)?.disabled).toBe(false);
});
