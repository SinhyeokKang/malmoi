// @vitest-environment jsdom
import { act, Suspense, use, useLayoutEffect, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **다른 소스로의 이동은 재마운트이고, 포커스가 `body`로 빠지지 않는다** (translation-tree-range T7 — spec 조건 14 · design §4.4).
 *
 * 트리 클릭 · 전 소스 결과의 다른 소스 키 · 검색 딥링크의 검색 지우기는 `surfaces/[surfaceSlug]` 세그먼트를 바꿔 화면을 새로 마운트하고, 누른 컨트롤이
 * 사라진다. 착지는 트리의 그 노드 / 그 행 / 검색 입력이고, 트리가 접힌 레이아웃이면 트리 열기 버튼이다.
 *
 * ⚠️ **재마운트를 실제로 만든다** (POSTMORTEM 2026-09-24 규칙 — 성공 뒤 착지를 컴포넌트 안에서 기다리면 호출부가 그 컴포넌트를 같은 자리에 두는가를
 * 호출부 조립으로 잰다). 하네스가 경로 소스를 `key`로 써서 언마운트 → 새 마운트한다. 제자리 재렌더로는 이 결함이 원리적으로 안 보인다.
 * ⚠️ **커밋마다 layout 단계 끝의 포커스를 잰다**(`FocusProbe` — #158) — `act()` 뒤의 `activeElement`만 보면 칠해진 `body` 프레임을 못 잰다.
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";
import type { TranslationListRow } from "@/lib/keys/translation-list";
import { m } from "@/lib/i18n";
import { tallyRows } from "@/lib/translations/tree-narrow";

import { props } from "./helpers/workspace-props";

const w = m.translations.workspace;
const rowOf = (keyId: string, surfaceSlug: string, namespace: string): TranslationListRow => ({
  keyId, surfaceSlug, namespace, key: `${namespace}.${keyId}`, sourceText: keyId, missingCount: 1, totalLocales: 2, hasPending: false, hasReview: false, isNew: false,
});
const TREE2: WorkspaceProps["tree"] = {
  projectKeyCount: 3,
  surfaces: [
    { id: "s2", slug: "app", baseLocale: "en", locales: ["en", "ko"], keyCount: 1, namespaces: [{ name: "home", keyCount: 1 }] },
    { id: "s1", slug: "web", baseLocale: "en", locales: ["en", "ko", "zh"], keyCount: 2, namespaces: [{ name: "common", keyCount: 2 }] },
  ],
};
const ROWS = [rowOf("a1", "app", "home"), rowOf("k1", "web", "common"), rowOf("k2", "web", "common")];
type Detail = Exclude<WorkspaceProps["detail"], null | { absent: true }>;
const detailOf = (id: string, surfaceSlug: string, namespace: string): Detail => {
  const base = props().detail as Detail;
  return { ...base, key: { ...base.key, id, key: `${namespace}.${id}`, namespace, surfaceSlug }, locales: base.locales.slice(0, 2) };
};
/** 서버가 그 주소를 그린 결과 — 경로 소스·쿼리를 주소에서 읽는다. */
function serve(href: string): WorkspaceProps {
  const url = new URL(href, "http://x");
  const route = url.pathname.split("/")[4]!;
  const q = url.searchParams.get("q") ?? undefined;
  const ns = url.searchParams.get("ns") ?? "*";
  const rawKey = url.searchParams.get("key") ?? undefined;
  const rows = q !== undefined && url.searchParams.get("scope") === null ? ROWS : ROWS.filter(r => r.surfaceSlug === route && (ns === "*" || r.namespace === ns));
  const key = rawKey === "@first" ? rows[0]?.keyId : rawKey;
  const at = ROWS.find(r => r.keyId === key);
  const base = props({ tree: TREE2 });
  return {
    ...base,
    routeSurfaceSlug: route,
    query: { ...base.query, ns, q, scope: q === undefined ? (ns === "*" ? "source" : "namespace") : url.searchParams.get("scope") === null ? "project" : "source", key, keySurface: at?.surfaceSlug },
    list: { ...base.list, rows, matchedKeyCount: rows.length, incompleteKeyCount: rows.length },
    counts: q === undefined ? null : tallyRows(ROWS),
    detail: at === undefined ? null : detailOf(at.keyId, at.surfaceSlug, at.namespace),
  };
}

/** `null`은 목적지가 워크스페이스를 그리지 않은 경우다(ProjectNotReady · 오류 경계 등). */
let respond: (href: string) => WorkspaceProps | null = serve;
function Commit({ entry }: { entry: { how: "push" | "replace"; href: string } | null }) {
  useLayoutEffect(() => { if (entry !== null) window.history[entry.how === "push" ? "pushState" : "replaceState"](null, "", entry.href); }, [entry]);
  return null;
}
const commitFocus: (Element | null)[] = [];
function FocusProbe() {
  useLayoutEffect(() => { commitFocus.push(document.activeElement); });
  return null;
}
function Harness({ initial }: { initial: WorkspaceProps }) {
  const [state, setState] = useState<{ props: WorkspaceProps | null; entry: { how: "push" | "replace"; href: string } | null }>({ props: initial, entry: null });
  const move = (how: "push" | "replace") => (href: string) => setState({ props: respond(href), entry: { how, href } });
  mocks.push.mockImplementation(move("push"));
  mocks.replace.mockImplementation(move("replace"));
  return (
    <Suspense fallback={null}>
      <Commit entry={state.entry} />
      {/* `surfaces/[surfaceSlug]` 세그먼트가 바뀌면 Next가 화면을 재마운트한다. */}
      {state.props === null ? <p data-not-workspace="" /> : <TranslationWorkspace key={state.props.routeSurfaceSlug} {...state.props} />}
      <FocusProbe />
    </Suspense>
  );
}
const settle = () => act(async () => {});
const row = (keyId: string) => document.querySelector<HTMLElement>(`[data-key-row="${keyId}"]`);
const treeNode = (surface: string, ns: string) => [...document.querySelectorAll<HTMLElement>("[data-tree-ns]")].find(el => el.dataset.treeSurface === surface && el.dataset.treeNs === ns);
const searchBox = () => document.querySelector<HTMLInputElement>(`input[aria-label="${w.filters.search}"]`)!;
const toggle = () => {
  const button = document.querySelector<HTMLElement>(`button[aria-label="${w.tree.open}"]`);
  if (button) for (const token of ["size-7", "rounded-sm", "px-0"]) expect(button.classList.contains(token)).toBe(true);
  return button;
};
const searching = (): WorkspaceProps => serve("/projects/acme/surfaces/web/translations?ns=common&q=k&key=k1");

/** jsdom의 폭 — `observe`가 즉시 부르면 마운트 폭, `later`로 마운트 뒤에 바꾼다. */
function stubWidth(width: number | null) {
  const callbacks: ResizeObserverCallback[] = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) { callbacks.push(callback); }
    observe() { if (width !== null) this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    disconnect() {}
    unobserve() {}
  });
  return { later: (next: number) => act(async () => { for (const cb of callbacks) cb([{ contentRect: { width: next } } as ResizeObserverEntry], {} as ResizeObserver); }) };
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  respond = serve;
  window.sessionStorage.clear();
  commitFocus.length = 0;
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations?ns=common&q=k&key=k1");
});
afterEach(() => { vi.unstubAllGlobals(); });

it("전 소스 결과에서 다른 소스의 키를 고르면 재마운트된 화면의 그 행에 착지한다 — body 프레임이 없다", async () => {
  const user = userEvent.setup();
  await render(<Harness initial={searching()} />);
  const before = row("a1");
  commitFocus.length = 0;
  await user.click(before!);
  await settle();
  expect(new URL(mocks.replace.mock.calls[0]![0] as string, "http://x").pathname).toBe("/projects/acme/surfaces/app/translations");
  // 재마운트됐다 — 같은 행 요소가 아니다.
  expect(row("a1")).not.toBe(before);
  expect(document.activeElement).toBe(row("a1"));
  expect(commitFocus.filter(el => el === document.body)).toEqual([]);
});

it("트리에서 다른 소스를 누르면 재마운트된 화면의 그 트리 노드에 착지한다", async () => {
  const user = userEvent.setup();
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations");
  await render(<Harness initial={serve("/projects/acme/surfaces/web/translations")} />);
  await user.click([...document.querySelectorAll<HTMLElement>("[data-tree-surface]")].find(el => el.dataset.treeSurface === "app" && el.dataset.treeNs === undefined)!);
  commitFocus.length = 0;
  await user.click(treeNode("app", "home")!);
  await settle();
  expect(new URL(mocks.push.mock.calls[0]![0] as string, "http://x").pathname).toBe("/projects/acme/surfaces/app/translations");
  expect(document.activeElement).toBe(treeNode("app", "home"));
  expect(commitFocus.filter(el => el === document.body)).toEqual([]);
});

it("검색 딥링크(다른 소스의 키)에서 검색을 지우면 그 키의 소스로 옮겨 가고 검색 입력에 착지한다", async () => {
  const user = userEvent.setup();
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations?q=k&key=a1&keySurface=app");
  await render(<Harness initial={serve("/projects/acme/surfaces/web/translations?q=k&key=a1")} />);
  await user.clear(searchBox());
  await user.type(searchBox(), "{Enter}");
  await settle();
  const url = new URL(mocks.push.mock.calls[0]![0] as string, "http://x");
  expect(url.pathname).toBe("/projects/acme/surfaces/app/translations");
  expect(Object.fromEntries(url.searchParams)).toEqual({ ns: "home", key: "a1", keySurface: "app" });
  expect(document.activeElement).toBe(searchBox());
});

it("트리가 접힌 레이아웃에서 오버레이로 다른 소스를 고르면 재마운트 뒤 트리 열기 버튼에 착지한다", async () => {
  stubWidth(700);
  const user = userEvent.setup();
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations");
  await render(<Harness initial={serve("/projects/acme/surfaces/web/translations")} />);
  await user.click(toggle()!);
  await user.click([...document.querySelectorAll<HTMLElement>("[data-tree-surface]")].find(el => el.dataset.treeSurface === "app" && el.dataset.treeNs === undefined)!);
  await user.click(treeNode("app", "home")!);
  await settle();
  expect(new URL(mocks.push.mock.calls[0]![0] as string, "http://x").pathname).toBe("/projects/acme/surfaces/app/translations");
  expect(treeNode("app", "home")).toBeUndefined();
  expect(document.activeElement).toBe(toggle());
});

it("마운트 뒤 폭 측정이 트리를 접으면 착지한 노드 대신 트리 열기 버튼으로 잇는다 — 이미 옮긴 포커스는 뺏지 않는다", async () => {
  const width = stubWidth(null);
  const user = userEvent.setup();
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations");
  await render(<Harness initial={serve("/projects/acme/surfaces/web/translations")} />);
  await user.click([...document.querySelectorAll<HTMLElement>("[data-tree-surface]")].find(el => el.dataset.treeSurface === "app" && el.dataset.treeNs === undefined)!);
  await user.click(treeNode("app", "home")!);
  await settle();
  expect(document.activeElement).toBe(treeNode("app", "home"));
  await width.later(700);
  expect(treeNode("app", "home")).toBeUndefined();
  expect(document.activeElement).toBe(toggle());

  // 짝 — 착지 뒤 사용자가 다른 컨트롤로 옮겼으면 접혀도 그대로다.
  await width.later(1400);
  await user.click(treeNode("app", "home")!);
  await user.click([...document.querySelectorAll<HTMLElement>("[data-tree-surface]")].find(el => el.dataset.treeSurface === "web" && el.dataset.treeNs === undefined)!);
  await user.click(treeNode("web", "*")!);
  await settle();
  expect(document.activeElement).toBe(treeNode("web", "*"));
  searchBox().focus();
  await width.later(700);
  expect(document.activeElement).toBe(searchBox());
});

it("넓은 화면에서 다른 소스로 옮기면 그 소스가 펼쳐진 채 노드로 착지한다", async () => {
  stubWidth(1400);
  const user = userEvent.setup();
  window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations");
  await render(<Harness initial={serve("/projects/acme/surfaces/web/translations")} />);
  await user.click([...document.querySelectorAll<HTMLElement>("[data-tree-surface]")].find(el => el.dataset.treeSurface === "app" && el.dataset.treeNs === undefined)!);
  await user.click(treeNode("app", "*")!);
  await settle();
  expect(document.activeElement).toBe(treeNode("app", "*"));
  expect(treeNode("app", "home")).toBeDefined();
});

it("표식의 소스가 마운트한 경로와 다르면 읽고 버리며 포커스를 옮기지 않는다 — 그 뒤 그 소스로 마운트해도 다시 쓰지 않는다", async () => {
  const user = userEvent.setup();
  // 이동한 곳이 다른 경로로 끝났다(세션 만료 → 로그인 왕복 등).
  respond = href => ({ ...serve(href)!, routeSurfaceSlug: "elsewhere" });
  await render(<Harness initial={searching()} />);
  await user.click(row("a1")!);
  await settle();
  expect(document.activeElement).not.toBe(row("a1"));
  // 나중에 app으로 새로 마운트해도 옛 표식으로 착지하지 않는다.
  await render(<TranslationWorkspace {...serve("/projects/acme/surfaces/app/translations?ns=home&q=k&key=a1")} />);
  expect(document.activeElement).toBe(document.body);
});

it("확인창에서 취소한 이동은 표식을 남기지 않는다", async () => {
  const user = userEvent.setup();
  await render(<Harness initial={searching()} />);
  await user.type(document.querySelector<HTMLTextAreaElement>('textarea[data-locale="ko"]')!, "!");
  await user.click(row("a1")!);
  await user.click([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === w.discard.keep)!);
  expect(mocks.replace).not.toHaveBeenCalled();
  (document.activeElement as HTMLElement | null)?.blur();
  await render(<TranslationWorkspace {...serve("/projects/acme/surfaces/app/translations?ns=home&q=k&key=a1")} />);
  expect(document.activeElement).toBe(document.body);
});

it("앱 안 소스 전환으로 도착하면 세션 복구 문구가 뜨지 않는다 (malmoi#100) — 새 탭의 첫 키에서는 뜬다(짝)", async () => {
  const user = userEvent.setup();
  const copy = () => window.sessionStorage.setItem("malmoi.translation-draft.u1.acme", JSON.stringify({ surfaceSlug: "app", keyId: "a1", saved: { en: "Nothing here", ko: "비어 있음" }, draft: { en: "Nothing here", ko: "복구" } }));
  copy();
  await render(<Harness initial={searching()} />);
  await user.click(row("a1")!);
  await settle();
  expect(document.activeElement).toBe(row("a1"));
  expect(document.body.textContent).not.toContain(w.footer.session.restored(1));
  // 짝 — 표식 없이(다시 로그인한 새 탭) 같은 키를 처음 열면 문구가 선다.
  copy();
  const fresh = await render(<TranslationWorkspace {...serve("/projects/acme/surfaces/app/translations?ns=home&q=k&key=a1")} />);
  expect(fresh.container.textContent).toContain(w.footer.session.restored(1));
});

it("목적지가 워크스페이스를 그리지 않았으면 표식이 만료된다 — 나중에 그 소스를 따로 열어도 포커스를 뺏지 않는다", async () => {
  const user = userEvent.setup();
  respond = () => null;
  await render(<Harness initial={searching()} />);
  await user.click(row("a1")!);
  await settle();
  expect(document.querySelector("[data-not-workspace]")).not.toBeNull();
  // 한참 뒤 사이드바 등으로 같은 소스를 연다.
  const later = Date.now() + 60_000;
  const now = vi.spyOn(Date, "now").mockReturnValue(later);
  try {
    (document.activeElement as HTMLElement | null)?.blur();
    await render(<TranslationWorkspace {...serve("/projects/acme/surfaces/app/translations?ns=home&q=k&key=a1")} />);
    expect(document.activeElement).toBe(document.body);
  } finally { now.mockRestore(); }
});

it("표식을 쓰고 서버가 몇 초 걸려 재마운트해도 착지한다 — 만료는 서버 렌더 한 번보다 길다", async () => {
  const user = userEvent.setup();
  const start = Date.now();
  const now = vi.spyOn(Date, "now");
  try {
    // 표식을 쓴 뒤 서버 렌더에 5초가 걸렸다.
    respond = href => { now.mockReturnValue(start + 5_000); return serve(href); };
    await render(<Harness initial={searching()} />);
    await user.click(row("a1")!);
    await settle();
    expect(document.activeElement).toBe(row("a1"));
  } finally { now.mockRestore(); }
});

it("앱 안에서 도착한 화면은 한참 뒤 처음 고른 키에서도 세션 복구 문구를 띄우지 않는다 (malmoi#100) — 판정은 마운트에서 한 번이다", async () => {
  const user = userEvent.setup();
  const start = Date.now();
  const now = vi.spyOn(Date, "now");
  try {
    // 트리로 app에 왔는데 선택 키가 없었다(빈 선택) — 복구 판정은 처음 고르는 키에서 돈다.
    respond = href => {
      const served = serve(href);
      return new URL(href, "http://x").searchParams.get("key") === "@first" ? { ...served, query: { ...served.query, key: undefined, keySurface: undefined }, detail: null } : served;
    };
    window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations");
    await render(<Harness initial={serve("/projects/acme/surfaces/web/translations")} />);
    await user.click([...document.querySelectorAll<HTMLElement>("[data-tree-surface]")].find(el => el.dataset.treeSurface === "app" && el.dataset.treeNs === undefined)!);
    await user.click(treeNode("app", "home")!);
    await settle();
    expect(document.activeElement).toBe(treeNode("app", "home"));
    window.sessionStorage.setItem("malmoi.translation-draft.u1.acme", JSON.stringify({ surfaceSlug: "app", keyId: "a1", saved: { en: "Nothing here", ko: "비어 있음" }, draft: { en: "Nothing here", ko: "복구" } }));
    // 20초 뒤(표식 만료보다 늦게) 처음 키를 고른다.
    now.mockReturnValue(start + 20_000);
    await user.click(row("a1")!);
    await settle();
    expect(document.querySelector('textarea[data-locale="ko"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain(w.footer.session.restored(1));
  } finally { now.mockRestore(); }
});
