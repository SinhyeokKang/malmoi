// @vitest-environment jsdom
import { act, Suspense, use, useLayoutEffect, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **트리 = 목록 범위, 필터는 Status 하나, 검색은 전 소스** (translation-tree-range T5·T6 — spec 조건 1–10·13 · design §4).
 *
 * - 트리는 노드를 숨기지 않는다. 조건(Status·검색)이 켜지면 숫자만 일치 수이고 0 노드는 `disabled`다 — 지금 범위·위치 노드는 예외.
 * - 검색 중이고 활성 소스가 둘 이상이면 트리 맨 위에 `All sources` 노드가 선다. 범위는 `aria-current="true"`, 전 소스 범위의 위치는
 *   `aria-current="location"`(면 없이 글자만)이다.
 * - 트리 클릭·키 선택은 Status·검색어를 바꾸지 않는다(조건 2). 새 검색어는 전 소스, 같은 검색어는 범위 유지(조건 5).
 *
 * ⚠️ 이동 테스트는 `router`를 Next처럼 흉내 낸다(`translation-workspace-transition.test.tsx`와 같은 하네스) — 경로 소스가 바뀌면 `key`로 재마운트한다.
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), rowRenders: [] as string[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));
vi.mock("@/components/ui/list-item", async (orig) => {
  const actual = await orig<typeof import("@/components/ui/list-item")>();
  return {
    ...actual,
    ListItemButton: (props: Parameters<typeof actual.ListItemButton>[0] & { "data-key-row"?: string }) => {
      if (props["data-key-row"] !== undefined) mocks.rowRenders.push(props["data-key-row"]);
      return actual.ListItemButton(props);
    },
  };
});

import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";
import type { TranslationListRow } from "@/lib/keys/translation-list";
import { m } from "@/lib/i18n";
import { tallyRows } from "@/lib/translations/tree-narrow";

import { props } from "./helpers/workspace-props";

const w = m.translations.workspace;
const rowOf = (keyId: string, surfaceSlug: string, namespace: string): TranslationListRow => ({
  keyId, surfaceSlug, namespace, key: `${namespace}.${keyId}`, sourceText: keyId, missingCount: 1, totalLocales: 3, hasPending: false, hasReview: true, isNew: false,
});
const TREE2: WorkspaceProps["tree"] = {
  projectKeyCount: 4,
  surfaces: [
    { id: "s2", slug: "app", baseLocale: "en", locales: ["en", "ko"], keyCount: 1, namespaces: [{ name: "app", keyCount: 1 }] },
    { id: "s1", slug: "web", baseLocale: "en", locales: ["en", "ko", "zh"], keyCount: 3, namespaces: [{ name: "auth", keyCount: 1 }, { name: "common", keyCount: 2 }] },
  ],
};
const ALL_ROWS = [rowOf("a1", "app", "app"), rowOf("k1", "web", "common"), rowOf("k2", "web", "common"), rowOf("k3", "web", "auth")];
function withList(base: WorkspaceProps, rows: TranslationListRow[]): WorkspaceProps["list"] {
  return { ...base.list, rows, matchedKeyCount: rows.length, incompleteKeyCount: rows.length };
}
/** 전 소스 검색 화면 — 서버는 전 소스 행과 그 행의 수를 싣는다. */
function searching(over: Partial<WorkspaceProps["query"]> = {}, rows = ALL_ROWS): WorkspaceProps {
  const base = props({ tree: TREE2 });
  return { ...base, query: { ...base.query, ns: "common", scope: "project", q: "k", ...over }, list: withList(base, rows), counts: tallyRows(rows) };
}
const treePanel = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-tree-panel]")!;
const treeButtons = (container: HTMLElement) => [...treePanel(container).querySelectorAll<HTMLButtonElement>("button")];
const treeNode = (container: HTMLElement, label: string, surface?: string) => treeButtons(container).find(b => b.querySelector("span.min-w-0")?.textContent === label
  && (surface === undefined || b.dataset.treeSurface === surface));
const statusTrigger = (container: HTMLElement) => container.querySelector<HTMLButtonElement>(`button[aria-label^="${w.filters.state.axis}:"]`);
const searchInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>(`input[aria-label="${w.filters.search}"]`)!;
const menuItems = () => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].map(el => el.textContent?.trim());
const pushed = (index = 0) => new URL(mocks.push.mock.calls[index]![0] as string, "http://x");
const replaced = (index = 0) => new URL(mocks.replace.mock.calls[index]![0] as string, "http://x");

// ── Next 흉내 하네스 (transition 테스트와 같은 형) ───────────────────────────────
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
      {/* `surfaces/[surfaceSlug]` 세그먼트가 바뀌면 Next가 화면을 재마운트한다. */}
      <TranslationWorkspace key={state.props.routeSurfaceSlug} {...state.props} />
    </Suspense>
  );
}
const arrive = async (entry: Gate) => { await act(async () => { entry.open(); await entry.promise; }); };

beforeEach(() => {
  for (const fn of [mocks.push, mocks.replace, mocks.refresh]) fn.mockReset();
  mocks.rowRenders.length = 0;
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations?key=k1&keySurface=web");
});
afterEach(async () => {
  for (const entry of gates.splice(0)) await act(async () => entry.open());
});

// ── 툴바 (조건 3) ─────────────────────────────────────────────────────────────────

it("필터 트리거는 Status 하나이고 선택지는 다섯이다 — Scope 트리거와 툴바 Clear filters가 없다", async () => {
  const user = userEvent.setup();
  const base = props({ tree: TREE2 });
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, state: "review" }} />);
  const triggers = [...container.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')].filter(b => !b.closest("[data-panel]"));
  expect(triggers.map(b => b.getAttribute("aria-label"))).toEqual([`${w.filters.state.axis}: ${w.filters.state.review}`]);
  // 툴바(목록·상세 패널 밖)에 Clear filters가 없다 — 축이 하나라 Status 콤보의 All keys가 그 일이다.
  expect([...container.querySelectorAll("button")].filter(b => !b.closest("[data-panel]") && b.textContent?.trim() === w.filters.clear)).toEqual([]);
  await user.click(statusTrigger(container)!);
  expect(menuItems()).toEqual([w.filters.state.any, w.filters.state.incomplete, w.filters.state.review, w.filters.state.unsent, w.filters.state.new]);
});

it("Status를 고르면 completion·state 한 쌍만 바꾼 주소로 push한다 — 위치·검색어는 남는다", async () => {
  const user = userEvent.setup();
  const base = props({ tree: TREE2 });
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, ns: "common", scope: "namespace", state: "review" }} />);
  await user.click(statusTrigger(container)!);
  await user.click([...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(el => el.textContent?.trim() === w.filters.state.incomplete)!);
  expect(Object.fromEntries(pushed().searchParams)).toEqual({ ns: "common", completion: "incomplete", key: "k1", keySurface: "web" });
});

it("검색 입력의 접근 이름은 Search keys이고 플레이스홀더가 전 소스를 말한다", async () => {
  const { container } = await render(<TranslationWorkspace {...props()} />);
  expect(searchInput(container).placeholder).toBe(w.filters.searchPlaceholder);
});

// ── 트리 (조건 1·2·4·6·9) ─────────────────────────────────────────────────────────

it("트리 클릭은 그 노드를 범위로 push하고 completion·state·q를 바꾸지 않는다 (조건 1·2)", async () => {
  const user = userEvent.setup();
  const base = props({ tree: TREE2 });
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, completion: "incomplete", q: "k", scope: "project" }} counts={tallyRows(ALL_ROWS)} />);
  await user.click(treeNode(container, "auth")!);
  const url = pushed();
  expect(url.pathname).toBe("/projects/acme/surfaces/web/translations");
  expect(Object.fromEntries(url.searchParams)).toEqual({ ns: "auth", scope: "namespace", completion: "incomplete", q: "k", key: "@first" });
});

it("다른 소스의 All namespaces를 누르면 그 소스 경로로 간다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props({ tree: TREE2 })} />);
  // 경로 밖 소스는 접혀 있다 — 펼친 뒤 누른다.
  await user.click(treeNode(container, "app")!);
  await user.click(treeNode(container, w.tree.allNamespaces, "app")!);
  expect(pushed().pathname).toBe("/projects/acme/surfaces/app/translations");
  expect(Object.fromEntries(pushed().searchParams)).toEqual({ key: "@first" });
});

it("검색어가 없으면 All sources 노드가 없고, 위치 노드가 범위다", async () => {
  const base = props({ tree: TREE2 });
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, ns: "common", scope: "namespace" }} />);
  expect(treeNode(container, w.tree.allSources)).toBeUndefined();
  expect(treeNode(container, "common")?.getAttribute("aria-current")).toBe("true");
  expect(treeNode(container, w.tree.allNamespaces, "web")?.getAttribute("aria-current")).toBeNull();
});

it("검색 중이고 활성 소스가 둘 이상이면 All sources 노드가 소스 행들 맨 위에 범위로 선다 — 숫자는 전 소스 일치 수 (조건 4)", async () => {
  const { container } = await render(<TranslationWorkspace {...searching({ ns: "*" })} />);
  const node = treeNode(container, w.tree.allSources)!;
  expect(node.getAttribute("aria-current")).toBe("true");
  expect(treeButtons(container)[0]).toBe(node);
  expect(node.textContent).toContain("4");
});

it("활성 소스가 하나면 검색 중에도 All sources 노드가 없고 그 소스의 All namespaces가 범위다 (조건 4)", async () => {
  const base = props();
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, q: "k", scope: "project" }} counts={tallyRows(base.list.rows)} />);
  expect(treeNode(container, w.tree.allSources)).toBeUndefined();
  expect(treeNode(container, w.tree.allNamespaces)?.getAttribute("aria-current")).toBe("true");
});

it("전 소스 결과에서 고른 키의 네임스페이스는 위치(location)로 글자만 강조되고 면이 없다 — All sources가 범위로 남는다 (조건 7)", async () => {
  const { container } = await render(<TranslationWorkspace {...searching({ ns: "common" })} />);
  const location = treeNode(container, "common")!;
  expect(location.getAttribute("aria-current")).toBe("location");
  expect(location.className).not.toContain("bg-foreground/[0.07]");
  expect(location.querySelector("span.min-w-0")?.className).toContain("font-medium");
  expect(treeNode(container, w.tree.allSources)?.getAttribute("aria-current")).toBe("true");
});

it("조건이 켜지면 노드를 숨기지 않고 숫자만 일치 수다 — 0 노드는 disabled, 범위 노드는 0이어도 활성 (조건 9)", async () => {
  const base = props({ tree: TREE2 });
  const rows = [rowOf("k1", "web", "common")];
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, ns: "auth", scope: "namespace", state: "review", key: undefined, keySurface: undefined }} detail={null} list={withList(base, [])} counts={tallyRows(rows)} />);
  const labels = treeButtons(container).map(b => b.querySelector("span.min-w-0")?.textContent);
  for (const label of ["app", "web", "auth", "common"]) expect(labels).toContain(label);
  expect(treeNode(container, "common")?.textContent).toContain("1");
  // 범위(auth)는 0이어도 누를 수 있다 — 포커스 대상이 사라지지 않는다.
  expect(treeNode(container, "auth")?.disabled).toBe(false);
  expect(treeNode(container, "auth")?.getAttribute("aria-current")).toBe("true");
  // 소스 행(펼침 토글)은 0이어도 활성이다.
  expect(treeNode(container, "app")?.disabled).toBe(false);
  expect(treeNode(container, "app")?.textContent).toContain("0");
  await userEvent.setup().click(treeNode(container, "app")!);
  const appAll = treeNode(container, w.tree.allNamespaces, "app")!;
  expect(appAll.disabled).toBe(true);
  expect(appAll.className).toContain("text-muted-foreground");
  // 누를 수 없는 노드에 hover 면이 서면 누를 수 있는 것처럼 보인다 — 짝: 누를 수 있는 노드는 hover 면이 있다.
  expect(appAll.className).not.toContain("hover:bg-foreground");
  expect(treeNode(container, "common")?.className).toContain("hover:bg-foreground/[0.03]");
  expect(treeNode(container, "common")?.disabled).toBe(false);
});

it("조건이 없으면 트리는 원본 숫자다 — 목록과 무관한 활성 키 수", async () => {
  const base = props({ tree: TREE2 });
  const { container } = await render(<TranslationWorkspace {...base} list={withList(base, [rowOf("k1", "web", "common")])} />);
  expect(treeNode(container, "common")?.textContent).toContain("2");
  expect(treeNode(container, "auth")?.textContent).toContain("1");
  expect(treeButtons(container).some(b => b.disabled)).toBe(false);
});

it("검색 중 범위 밖 노드의 숫자는 그 노드를 눌렀을 때의 목록 수다 (조건 9)", async () => {
  const { container } = await render(<TranslationWorkspace {...searching({ ns: "common" })} />);
  expect(treeNode(container, "auth")?.textContent).toContain("1");
  expect(treeNode(container, w.tree.allNamespaces, "web")?.textContent).toContain("3");
});

it("머리 배지는 원본 활성 소스 수다 — 조건이 숫자를 바꿔도 같다", async () => {
  const { container } = await render(<TranslationWorkspace {...searching()} />);
  expect(treePanel(container).querySelector("h2")?.nextElementSibling?.querySelector("[aria-hidden]")?.textContent).toBe("2");
});

it("접혀 있던 소스로 위치가 옮겨 가면 그 소스를 펼친다", async () => {
  const user = userEvent.setup();
  const initial = searching({ ns: "common" });
  const { container, rerender } = await render(<TranslationWorkspace {...initial} />);
  // 사용자가 지금 소스를 접었다.
  await user.click(treeNode(container, "web")!);
  expect(treeNode(container, "auth")).toBeUndefined();
  // 전 소스 결과에서 같은 소스의 auth 키를 골랐다 — 위치가 web/auth로 옮겨 간다.
  await rerender(<TranslationWorkspace {...initial} query={{ ...initial.query, ns: "auth", key: "k3", keySurface: "web" }} />);
  expect(treeNode(container, "auth")?.getAttribute("aria-current")).toBe("location");
});

it("`Filter namespaces` 검색어가 위치 노드를 숨기지 않는다 · 입력은 원본 트리로 임계를 판정한다", async () => {
  const user = userEvent.setup();
  const names = Array.from({ length: 14 }, (_, i) => `ns${String(i).padStart(2, "0")}`);
  const tree: WorkspaceProps["tree"] = { projectKeyCount: 14, surfaces: [{ id: "s1", slug: "web", baseLocale: "en", locales: ["en"], keyCount: 14, namespaces: names.map(name => ({ name, keyCount: 1 })) }] };
  const base = props({ tree });
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, ns: "ns07", scope: "namespace" }} list={withList(base, [rowOf("k1", "web", "ns07")])} />);
  await user.type(container.querySelector<HTMLInputElement>(`input[aria-label="${w.tree.filter}"]`)!, "ns1");
  expect(treeNode(container, "ns11")).toBeDefined();
  expect(treeNode(container, "ns03")).toBeUndefined();
  expect(treeNode(container, "ns07")?.getAttribute("aria-current")).toBe("true");
});

// ── 목록 (조건 10) · 빈 문구 ───────────────────────────────────────────────────────

it("`surface · key` 접두는 범위가 All sources이고 활성 소스가 둘 이상일 때만이다 (조건 10)", async () => {
  const all = await render(<TranslationWorkspace {...searching()} />);
  expect(all.container.querySelector('[data-key-row="a1"]')?.textContent).toContain("app · app.a1");
  const base = props({ tree: TREE2 });
  const narrowed = await render(<TranslationWorkspace {...base} query={{ ...base.query, q: "k", scope: "source" }} list={withList(base, [rowOf("k1", "web", "common")])} counts={tallyRows([rowOf("k1", "web", "common")])} />);
  expect(narrowed.container.querySelector('[data-key-row="k1"]')?.textContent).not.toContain("web · ");
  const single = props();
  const one = await render(<TranslationWorkspace {...single} query={{ ...single.query, q: "c", scope: "project" }} />);
  expect(one.container.querySelector('[data-key-row="k1"]')?.textContent).not.toContain("web · ");
});

it("트리가 접힌 레이아웃의 breadcrumb은 범위 라벨이다 — 전 소스면 All sources, 아니면 소스(/ 네임스페이스)", async () => {
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe() { this.callback([{ contentRect: { width: 700 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    disconnect() {}
    unobserve() {}
  });
  try {
    const crumb = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-panel=list] [data-range-label]")?.textContent;
    expect(crumb((await render(<TranslationWorkspace {...searching()} />)).container)).toBe(w.tree.allSources);
    const base = props({ tree: TREE2 });
    expect(crumb((await render(<TranslationWorkspace {...base} query={{ ...base.query, ns: "auth", scope: "namespace" }} />)).container)).toBe("web / auth");
    expect(crumb((await render(<TranslationWorkspace {...base} />)).container)).toBe("web");
  } finally { vi.unstubAllGlobals(); }
});

it("빈 위치(조건 없음 · 0건)는 그 위치를 말하고 버튼이 없다", async () => {
  const base = props({ tree: TREE2 });
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, ns: "auth", scope: "namespace", key: undefined, keySurface: undefined }} detail={null} list={withList(base, [])} />);
  const list = container.querySelector<HTMLElement>("[data-panel=list]")!;
  expect(list.textContent).toContain(w.empty.noKeys("auth"));
  expect(list.querySelectorAll("button:not([aria-label])")).toHaveLength(0);
});

// ── 검색 (조건 4·5·8) ─────────────────────────────────────────────────────────────

it("새 검색어는 scope 없는 주소(= 전 소스)로 간다", async () => {
  const user = userEvent.setup();
  const base = props({ tree: TREE2 });
  const { container } = await render(<TranslationWorkspace {...base} query={{ ...base.query, ns: "common", scope: "namespace" }} />);
  await user.type(searchInput(container), "save{Enter}");
  expect(Object.fromEntries(pushed().searchParams)).toEqual({ ns: "common", q: "save", key: "k1", keySurface: "web" });
});

it("위치로 좁힌 검색에서 검색어를 바꾸면 전 소스로, 같은 검색어를 다시 제출하면 범위가 남는다 (조건 5)", async () => {
  const user = userEvent.setup();
  const base = props({ tree: TREE2 });
  const narrowed = { ...base.query, ns: "common", scope: "namespace" as const, q: "hi" };
  const { container } = await render(<TranslationWorkspace {...base} query={narrowed} counts={tallyRows(base.list.rows)} />);
  await user.type(searchInput(container), "{Enter}");
  expect(pushed(0).searchParams.get("scope")).toBe("namespace");
  expect(pushed(0).searchParams.get("q")).toBe("hi");
  await user.clear(searchInput(container));
  await user.type(searchInput(container), "hello{Enter}");
  expect(pushed(1).searchParams.get("scope")).toBeNull();
  expect(pushed(1).searchParams.get("q")).toBe("hello");
});

it("검색 중 노드를 누르면 결과를 그 노드로 좁히고 검색어가 입력에 남는다 · All sources 노드는 전 소스로 되돌린다 (조건 6)", async () => {
  const user = userEvent.setup();
  const initial = searching({ ns: "*" });
  const b = gate();
  respond = href => {
    const url = new URL(href, "http://x");
    const narrowed = url.searchParams.get("ns") === "auth";
    return { next: { ...initial, query: { ...initial.query, ns: narrowed ? "auth" : "*", scope: narrowed ? "namespace" : "project", key: narrowed ? "k3" : "k1" }, list: withList(initial, narrowed ? [rowOf("k3", "web", "auth")] : ALL_ROWS) }, gate: narrowed ? b : null };
  };
  const { container } = await render(<Harness initial={initial} />);
  await user.click(treeNode(container, "auth")!);
  expect(Object.fromEntries(pushed(0).searchParams)).toMatchObject({ ns: "auth", scope: "namespace", q: "k" });
  await arrive(b);
  expect(searchInput(container).value).toBe("k");
  expect([...container.querySelectorAll<HTMLElement>("[data-key-row]")].map(el => el.dataset.keyRow)).toEqual(["k3"]);
  await user.click(treeNode(container, w.tree.allSources)!);
  expect(pushed(1).searchParams.get("scope")).toBeNull();
  expect(pushed(1).searchParams.get("q")).toBe("k");
  expect(pushed(1).searchParams.get("ns")).toBe("auth");
});

it("검색어를 지우면 범위가 고른 키의 위치로 돌아가고 그 키가 선택으로 남는다 (조건 8)", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...searching({ ns: "common" })} />);
  await user.clear(searchInput(container));
  await user.type(searchInput(container), "{Enter}");
  expect(pushed().pathname).toBe("/projects/acme/surfaces/web/translations");
  expect(Object.fromEntries(pushed().searchParams)).toEqual({ ns: "common", key: "k1", keySurface: "web" });
});

// ── 키 선택 (조건 7) ─────────────────────────────────────────────────────────────

it("전 소스에서 같은 소스의 다른 네임스페이스 키를 고르면 위치(ns)만 옮기고 목록 세대가 남는다 — 행이 다시 렌더되지 않는다", async () => {
  const user = userEvent.setup();
  const initial = searching({ ns: "common" });
  respond = () => ({ next: { ...initial, query: { ...initial.query, ns: "auth", key: "k3", keySurface: "web" }, list: withList(initial, ALL_ROWS.map(row => ({ ...row }))), counts: tallyRows(ALL_ROWS), detail: { ...(initial.detail as Exclude<WorkspaceProps["detail"], null | { absent: true }>), key: { id: "k3", key: "auth.k3", namespace: "auth", sourceText: "k3", description: null, surfaceSlug: "web" } } }, gate: null });
  const { container } = await render(<Harness initial={initial} />);
  const before = container.querySelector('[data-key-row="k2"]');
  await user.click(container.querySelector<HTMLElement>('[data-key-row="k3"]')!);
  expect(replaced().pathname).toBe("/projects/acme/surfaces/web/translations");
  expect(Object.fromEntries(replaced().searchParams)).toEqual({ ns: "auth", q: "k", key: "k3", keySurface: "web" });
  mocks.rowRenders.length = 0;
  await act(async () => {});
  expect(container.querySelector('[data-key-row="k2"]')).toBe(before);
  // 선택이 바뀐 두 행만 다시 그린다 — 전 행(새 세대)이 아니다.
  expect(new Set(mocks.rowRenders).has("a1")).toBe(false);
  expect(treeNode(container, "auth")?.getAttribute("aria-current")).toBe("location");
});

it("두 소스에 같은 이름의 키가 있어도 keyId·소스로 정확히 고르고, 다른 소스면 그 소스 경로로 간다", async () => {
  const user = userEvent.setup();
  const twins = [{ ...rowOf("a9", "app", "auth"), key: "auth.title" }, { ...rowOf("w9", "web", "auth"), key: "auth.title" }];
  const { container } = await render(<TranslationWorkspace {...searching({ ns: "common" }, twins)} />);
  await user.click(container.querySelector<HTMLElement>('[data-key-row="a9"]')!);
  expect(replaced().pathname).toBe("/projects/acme/surfaces/app/translations");
  expect(Object.fromEntries(replaced().searchParams)).toEqual({ ns: "auth", q: "k", key: "a9", keySurface: "app" });
});

it("ns=*에서 전 소스 검색 → 같은 소스 키 선택 → 그 네임스페이스 표시 → 검색 지우기 → 그 네임스페이스 목록", async () => {
  const user = userEvent.setup();
  const base = props({ tree: TREE2 });
  const initial: WorkspaceProps = { ...base, query: { ...base.query, ns: "*", scope: "source", key: undefined, keySurface: undefined }, detail: null };
  const detailOf = (id: string, namespace: string) => ({ ...(base.detail as Exclude<WorkspaceProps["detail"], null | { absent: true }>), key: { id, key: `${namespace}.${id}`, namespace, sourceText: id, description: null, surfaceSlug: "web" } });
  respond = href => {
    const url = new URL(href, "http://x");
    const q = url.searchParams.get("q") ?? undefined;
    const ns = url.searchParams.get("ns") ?? "*";
    const key = url.searchParams.get("key") ?? undefined;
    const query = { ...initial.query, ns, q, scope: q === undefined ? (ns === "*" ? "source" as const : "namespace" as const) : "project" as const, key, keySurface: key === undefined ? undefined : "web" };
    const rows = q === undefined ? ALL_ROWS.filter(r => r.surfaceSlug === "web" && (ns === "*" || r.namespace === ns)) : ALL_ROWS;
    return { next: { ...initial, query, list: withList(initial, rows), counts: q === undefined ? null : tallyRows(rows), detail: key === undefined ? null : detailOf(key, key === "k3" ? "auth" : "common") }, gate: null };
  };
  const { container } = await render(<Harness initial={initial} />);
  await user.type(searchInput(container), "k{Enter}");
  expect(pushed(0).searchParams.get("scope")).toBeNull();
  // 응답 커밋(transition)을 비운다 — 하네스의 응답은 gate 없이 바로 온다.
  await act(async () => {});
  await user.click(container.querySelector<HTMLElement>('[data-key-row="k3"]')!);
  await act(async () => {});
  expect(replaced(0).searchParams.get("ns")).toBe("auth");
  expect(treeNode(container, "auth")?.getAttribute("aria-current")).toBe("location");
  await user.clear(searchInput(container));
  await user.type(searchInput(container), "{Enter}");
  await act(async () => {});
  expect(Object.fromEntries(pushed(1).searchParams)).toEqual({ ns: "auth", key: "k3", keySurface: "web" });
  expect([...container.querySelectorAll<HTMLElement>("[data-key-row]")].map(el => el.dataset.keyRow)).toEqual(["k3"]);
  expect(treeNode(container, "auth")?.getAttribute("aria-current")).toBe("true");
});

it("새 검색을 기다리는 동안 All sources 노드는 숫자를 비운다 — 서버의 일치 수가 오기 전에 전체 키 수를 일치 수처럼 말하지 않는다", async () => {
  const user = userEvent.setup();
  const base = props({ tree: TREE2 });
  const initial: WorkspaceProps = { ...base, query: { ...base.query, ns: "common", scope: "namespace" } };
  const b = gate();
  respond = () => ({ next: searching({ ns: "common" }, [rowOf("k1", "web", "common")]), gate: b });
  const { container } = await render(<Harness initial={initial} />);
  await user.type(searchInput(container), "k{Enter}");
  const node = () => treeNode(container, w.tree.allSources)!;
  expect(node()).toBeDefined();
  expect(node().textContent).toBe(w.tree.allSources);
  await arrive(b);
  // 짝 — 도착하면 전 소스 일치 수(1)이고, 전체 키 수(4)가 아니다.
  expect(node().textContent).toBe(`${w.tree.allSources}1`);
});

// ── 스크롤 (조건 8 · design §4.3) ─────────────────────────────────────────────────

/** 전 소스 검색 → 같은 소스의 다른 네임스페이스 키 선택 → 검색 지우기. 서버 응답은 주소에서 만든다. */
function serveSearch(initial: WorkspaceProps) {
  const base = props({ tree: TREE2 });
  return (href: string) => {
    const url = new URL(href, "http://x");
    const q = url.searchParams.get("q") ?? undefined;
    const ns = url.searchParams.get("ns") ?? "*";
    const key = url.searchParams.get("key") ?? undefined;
    const rows = q === undefined ? ALL_ROWS.filter(r => r.surfaceSlug === "web" && (ns === "*" || r.namespace === ns)) : ALL_ROWS;
    const at = ALL_ROWS.find(r => r.keyId === key);
    const detail = at === undefined ? null : { ...(base.detail as Exclude<WorkspaceProps["detail"], null | { absent: true }>), key: { id: at.keyId, key: at.key, namespace: at.namespace, sourceText: at.keyId, description: null, surfaceSlug: at.surfaceSlug } };
    const query = { ...initial.query, ns, q, scope: q === undefined ? (ns === "*" ? "source" as const : "namespace" as const) : "project" as const, key, keySurface: at?.surfaceSlug };
    return { next: { ...initial, query, list: withList(initial, rows), counts: q === undefined ? null : tallyRows(rows), detail }, gate: null };
  };
}

it("검색을 지우면 고른 키의 행으로 스크롤한다 — 목록에서 누를 때는 스크롤하지 않는다 (조건 8)", async () => {
  const user = userEvent.setup();
  const initial = searching({ ns: "common" });
  respond = serveSearch(initial);
  const { container } = await render(<Harness initial={initial} />);
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  const rowScrolls = () => scroll.mock.contexts.filter(el => el instanceof HTMLElement && el.dataset.keyRow !== undefined);
  try {
    await user.click(container.querySelector<HTMLElement>('[data-key-row="k3"]')!);
    await act(async () => {});
    // 짝 — 보이는 행을 누른 것이라 스크롤하지 않는다.
    expect(rowScrolls()).toEqual([]);
    await user.clear(searchInput(container));
    await user.type(searchInput(container), "{Enter}");
    await act(async () => {});
    expect(Object.fromEntries(pushed().searchParams)).toEqual({ ns: "auth", key: "k3", keySurface: "web" });
    expect(rowScrolls()).toEqual([container.querySelector('[data-key-row="k3"]')]);
  } finally { scroll.mockRestore(); }
});

it("전 소스 결과에서 다른 네임스페이스 키를 고르면 트리의 그 위치 노드를 보이게 스크롤한다 — 마운트에는 하지 않는다", async () => {
  const user = userEvent.setup();
  const initial = searching({ ns: "common" });
  respond = serveSearch(initial);
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  const treeScrolls = () => scroll.mock.contexts.filter(el => el instanceof HTMLElement && el.dataset.treeNs !== undefined);
  try {
    const { container } = await render(<Harness initial={initial} />);
    expect(treeScrolls()).toEqual([]);
    await user.click(container.querySelector<HTMLElement>('[data-key-row="k3"]')!);
    await act(async () => {});
    expect(treeScrolls()).toEqual([treeNode(container, "auth")]);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
  } finally { scroll.mockRestore(); }
});

// ── 상세 언어 (조건 12) ──────────────────────────────────────────────────────────

it("language=@missing은 키·트리 이동에 이어진다 — 서버가 지운 언어는 주소에서 되살아나지 않는다", async () => {
  const user = userEvent.setup();
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations?key=k1&keySurface=web&language=%40missing");
  const base = props({ tree: TREE2 });
  const { container, rerender } = await render(<TranslationWorkspace {...base} query={{ ...base.query, language: "@missing" }} />);
  await user.click(container.querySelector<HTMLElement>('[data-key-row="k2"]')!);
  expect(replaced().searchParams.get("language")).toBe("@missing");
  await user.click(treeNode(container, "common")!);
  expect(pushed().searchParams.get("language")).toBe("@missing");
  // 서버 정규화가 잘못된 언어를 지운 주소로 착지했다 — 다음 이동이 옛 값을 다시 싣지 않는다.
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations?key=k1&keySurface=web");
  await rerender(<TranslationWorkspace {...base} />);
  await user.click(container.querySelector<HTMLElement>('[data-key-row="k2"]')!);
  expect(replaced(1).searchParams.get("language")).toBeNull();
});

it("상세의 링크 복사는 필터를 켜지 않은 채 그 키를 선택한 주소다 — scope를 싣지 않는다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<TranslationWorkspace {...props()} />);
  await user.click(container.querySelector<HTMLButtonElement>(`button[aria-label="${w.detail.copyLink}"]`)!);
  const url = new URL(await navigator.clipboard.readText());
  expect(url.pathname).toBe("/projects/acme/surfaces/web/translations");
  expect(Object.fromEntries(url.searchParams)).toEqual({ ns: "common", key: "k1", keySurface: "web" });
});
