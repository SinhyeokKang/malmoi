// @vitest-environment jsdom
import { act, Suspense, useLayoutEffect, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **번역 단일 판** (responsive-app A4 — design §3 전환 표 · 시안 AT6). 카드 content box 772 미만이면 목록과 상세가 같은 DOM의 두 판이고, 숨은 판은
 * `@container` + `data-pane`의 `display:none`이다. jsdom은 컨테이너 쿼리를 못 재므로 **클래스 계약 · `data-pane` · 포커스 대상 · 같은 노드**를 잰다.
 *
 * ⚠️ **focus fixup** — 브라우저는 `display:none`이 된 노드의 포커스를 `body`로 옮긴다(Chrome은 blur 없이, ARCHITECTURE §6.358). jsdom은 안 한다.
 * 아래 `fixup`이 single 폭에서 `data-pane`이 바뀌면 숨는 판 안의 포커스를 버린다 — 이것 없이 재면 "숨은 노드에 남은 포커스"로 통과한다.
 * ⚠️ 상세 판 키보드(AT6d)는 새 코드가 없다 — 브라우저의 포커스 스크롤이 한다. Save가 키보드 위에 서는 것은 **Android만**이다(D20 `interactive-widget`).
 * iOS Safari는 비대응이다(`visualViewport` 처리는 비목표 — spec 비목표).
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), save: vi.fn(), revertPreview: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: mocks.save, previewTranslationRevert: mocks.revertPreview, revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));

import { TranslationWorkspace, type WorkspaceProps } from "@/components/translations/workspace/workspace";
import type { TranslationListRow } from "@/lib/keys/translation-list";
import { en } from "@/messages/en";

import { props } from "./helpers/workspace-props";

const w = en.translations.workspace;
const rowOf = (keyId: string, surfaceSlug: string, namespace: string): TranslationListRow => ({
  keyId, surfaceSlug, namespace, key: `${namespace}.${keyId}`, sourceText: keyId, missingCount: 1, totalLocales: 3, hasPending: false, hasReview: false, isNew: false,
});
const TREE: WorkspaceProps["tree"] = {
  projectKeyCount: 5,
  surfaces: [
    { id: "s2", slug: "app", baseLocale: "en", locales: ["en", "ko", "zh"], keyCount: 2, namespaces: [{ name: "home", keyCount: 2 }] },
    { id: "s1", slug: "web", baseLocale: "en", locales: ["en", "ko", "zh"], keyCount: 3, namespaces: [{ name: "auth", keyCount: 1 }, { name: "common", keyCount: 2 }] },
  ],
};
const ROWS = [rowOf("a1", "app", "home"), rowOf("a2", "app", "home"), rowOf("x1", "web", "auth"), rowOf("k1", "web", "common"), rowOf("k2", "web", "common")];
type Detail = Exclude<WorkspaceProps["detail"], null | { absent: true }>;
const detailOf = (id: string, surfaceSlug: string, namespace: string): Detail => {
  const base = props().detail as Detail;
  return { ...base, key: { ...base.key, id, key: `${namespace}.${id}`, namespace, surfaceSlug } };
};
/** 서버가 그 주소를 그린 결과 — `@first`는 그 범위의 첫 행이다. */
function serve(href: string): WorkspaceProps {
  const url = new URL(href, "http://x");
  const route = url.pathname.split("/")[4]!;
  const ns = url.searchParams.get("ns") ?? "*";
  const rawKey = url.searchParams.get("key") ?? undefined;
  // Status `Incomplete`이면 k1이 결과에서 빠진다 — 선택 키가 결과 밖이 되는 필터 갈래(`selectedInResult`).
  const rows = ROWS.filter(r => r.surfaceSlug === route && (ns === "*" || r.namespace === ns) && !(url.searchParams.get("completion") === "incomplete" && r.keyId === "k1"));
  const key = rawKey === "@first" ? rows[0]?.keyId : rawKey;
  const at = ROWS.find(r => r.keyId === key);
  const base = props({ tree: TREE });
  return {
    ...base,
    routeSurfaceSlug: route,
    query: { ...base.query, ns, scope: ns === "*" ? "source" : "namespace", key, keySurface: at?.surfaceSlug },
    list: { ...base.list, rows, matchedKeyCount: rows.length, incompleteKeyCount: rows.length, selectedInResult: key === undefined || rows.some(r => r.keyId === key) },
    detail: at === undefined ? null : detailOf(at.keyId, at.surfaceSlug, at.namespace),
  };
}

/**
 * 하네스 — 주소를 **먼저** 옮기고 서버 결과를 그린다(Next는 새 트리의 렌더에서 `useSearchParams`가 새 주소다). 경로 소스가 바뀌면 재마운트한다.
 * `hold`가 켜져 있으면 응답을 쥐고 있다가 `flush`로 커밋한다(늦은 응답).
 */
let held: (() => void) | null = null;
let hold = false;
let setExternal: ((href: string) => void) | null = null;
function Harness({ initial }: { initial: WorkspaceProps }) {
  const [state, setState] = useState<WorkspaceProps>(initial);
  const move = (how: "push" | "replace") => (href: string) => {
    const commit = () => { window.history[how === "push" ? "pushState" : "replaceState"](null, "", href); setState(serve(href)); };
    if (hold) held = commit; else commit();
  };
  mocks.push.mockImplementation(move("push"));
  mocks.replace.mockImplementation(move("replace"));
  setExternal = href => { window.history.pushState(null, "", href); setState(serve(href)); };
  return <Suspense fallback={null}><TranslationWorkspace key={state.routeSurfaceSlug} {...state} /><FocusProbe /></Suspense>;
}
const commitFocus: (Element | null)[] = [];
function FocusProbe() {
  useLayoutEffect(() => { commitFocus.push(document.activeElement); });
  return null;
}
const settle = () => act(async () => {});
const flush = () => act(async () => { const commit = held; held = null; commit?.(); });
const external = (href: string) => act(async () => { setExternal!(href); });

/** ResizeObserver stub — 마운트 폭을 주고, `later`로 바꾼다. */
let width = 0;
function stubWidth(initial: number | null) {
  const callbacks: ResizeObserverCallback[] = [];
  width = initial ?? 0;
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) { callbacks.push(callback); }
    observe() { if (initial !== null) this.callback([{ contentRect: { width: initial } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    disconnect() {}
    unobserve() {}
  });
  return { later: (next: number) => act(async () => { width = next; for (const cb of callbacks) cb([{ contentRect: { width: next } } as ResizeObserverEntry], {} as ResizeObserver); }) };
}

const root = () => document.querySelector<HTMLElement>("[data-pane]")!;
const pane = () => root().dataset.pane;
const listCard = () => document.querySelector<HTMLElement>("[data-panel=list]")!.closest<HTMLElement>("[data-pane-card]")!;
const detailCard = () => document.querySelector<HTMLElement>("[data-panel=detail]")!;
const detailTitle = () => document.querySelector<HTMLElement>("[data-detail-title]")!;
const back = () => document.querySelector<HTMLButtonElement>(`button[aria-label="${en.responsive.backToKeys}"]`)!;
const row = (keyId: string) => document.querySelector<HTMLElement>(`[data-key-row="${keyId}"]`)!;
const textarea = (code: string) => document.querySelector<HTMLTextAreaElement>(`textarea[data-locale="${code}"]`)!;
const searchBox = () => document.querySelector<HTMLInputElement>(`input[aria-label="${w.filters.search}"]`)!;
const listScroller = () => document.querySelector<HTMLElement>("[data-panel=list] [data-list-scroll]")!;

/** 브라우저의 focus fixup — single 폭에서 숨는 판 안의 포커스를 버린다. */
let fixup: MutationObserver | undefined;
beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  window.sessionStorage.clear();
  commitFocus.length = 0;
  hold = false;
  held = null;
  fixup = new MutationObserver(() => {
    const node = document.querySelector<HTMLElement>("[data-pane]");
    if (node === null || width === 0 || width >= 772) return;
    const hidden = node.dataset.pane === "detail" ? listCard() : detailCard();
    const active = document.activeElement;
    if (active instanceof HTMLElement && hidden.contains(active)) active.blur();
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["data-pane"], subtree: true });
});
afterEach(() => { fixup?.disconnect(); vi.unstubAllGlobals(); });

const start = async (href: string, at: number | null) => {
  const size = stubWidth(at);
  window.history.replaceState(null, "", href);
  await render(<Harness initial={serve(href)} />);
  return size;
};

describe("판 표시는 CSS다 — 같은 DOM 한 벌", () => {
  it("body가 @container를 선언하고 자손이 772로 묻는다 — 선언 요소와 질의 요소가 다르다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", null);
    const body = root().querySelector<HTMLElement>("[data-workspace-body]")!;
    expect(body.className).toMatch(/(^| )@container\/ws( |$)/);
    expect(body.className).not.toMatch(/@max-\[772px\]/);
    expect(listCard().className).toContain("@max-[772px]/ws:in-data-[pane=detail]:hidden");
    expect(detailCard().className).toContain("@max-[772px]/ws:in-data-[pane=list]:hidden");
    const handle = document.querySelector<HTMLElement>('[role="separator"]')!;
    for (const token of ["@max-[772px]/ws:hidden", "touch-none"]) expect(handle.classList.contains(token)).toBe(true);
    expect(back().classList.contains("@min-[772px]/ws:hidden")).toBe(true);
    // 상세를 두 번 마운트하지 않는다.
    expect(document.querySelectorAll("[data-panel=detail]")).toHaveLength(1);
    expect(document.querySelectorAll(`textarea[data-locale="ko"]`)).toHaveLength(1);
  });

  it("측정 전에는 데스크톱 첫 렌더 그대로다 — 왼쪽 카드 폭 652, 판 판정은 CSS가 한다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", null);
    expect(listCard().style.getPropertyValue("--list-card")).toBe("652px");
    expect(pane()).toBe("detail");
  });

  it("key 없는 진입은 목록 판, key 있는 진입은 상세 판이다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common", 500);
    expect(pane()).toBe("list");
    await external("/projects/acme/surfaces/web/translations?ns=common&key=k2");
    expect(pane()).toBe("detail");
  });
});

describe("목록 ↔ 상세 (single)", () => {
  it("다른 키를 고르면 상세 판이고 상세 제목에 착지한다 — 제목은 골격 → 상세에서 같은 노드다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common", 500);
    hold = true;
    row("k2").focus();
    commitFocus.length = 0;
    await act(async () => { await userEvent.setup().click(row("k2")); });
    expect(pane()).toBe("detail");
    const title = detailTitle();
    expect(document.activeElement).toBe(title);
    await flush();
    expect(detailTitle()).toBe(title);
    expect(document.activeElement).toBe(title);
    expect(commitFocus.filter(el => el === document.body)).toEqual([]);
  });

  it("응답 전에 사용자가 옮긴 포커스는 응답이 빼앗지 않는다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common", 500);
    hold = true;
    await act(async () => { await userEvent.setup().click(row("k2")); });
    searchBox().focus();
    await flush();
    expect(document.activeElement).toBe(searchBox());
  });

  it("‹ Keys는 URL·history·draft를 그대로 두고 목록 판의 선택 행에 착지한다 — 같은 키를 다시 열면 입력이 그대로다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    const input = textarea("zh");
    await user.type(input, "draft");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const href = window.location.href;
    await act(async () => { await user.click(back()); });
    expect(pane()).toBe("list");
    expect(document.activeElement).toBe(row("k1"));
    await act(async () => { await user.click(row("k1")); });
    expect(pane()).toBe("detail");
    expect(document.activeElement).toBe(detailTitle());
    expect(textarea("zh")).toBe(input);
    expect(input.value).toBe("draft");
    expect(window.location.href).toBe(href);
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("목록 스크롤 위치를 숨기기 직전에 저장하고 다시 보일 때 되돌린다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common", 500);
    const scroller = listScroller();
    scroller.scrollTop = 240;
    scroller.dispatchEvent(new Event("scroll"));
    await act(async () => { await userEvent.setup().click(row("k2")); });
    // display:none이 scrollTop을 잃는다.
    scroller.scrollTop = 0;
    await act(async () => { await userEvent.setup().click(back()); });
    expect(listScroller().scrollTop).toBe(240);
  });

  it("미저장 입력이 있을 때 다른 키를 고르고 취소하면 판·포커스가 그대로다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    await user.type(textarea("zh"), "draft");
    await act(async () => { await user.click(back()); });
    await act(async () => { await user.click(row("k2")); });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => { await user.click([...document.querySelectorAll("button")].find(b => b.textContent === w.discard.keep)!); });
    expect(pane()).toBe("list");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(textarea("zh").value).toBe("draft");
  });
});

describe("폭 왕복 — 같은 상세 DOM", () => {
  it("목록으로 → split → 상세 입력 → single: 같은 textarea · activeElement · 선택 범위 · draft, URL·history 불변", async () => {
    const size = await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    const input = textarea("zh");
    await user.type(input, "draft");
    await act(async () => { await user.click(back()); });
    await size.later(1000);
    const pushState = vi.spyOn(window.history, "pushState");
    await act(async () => { input.focus(); input.setSelectionRange(1, 3); });
    await size.later(500);
    expect(pane()).toBe("detail");
    expect(textarea("zh")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    expect(input.value).toBe("draft");
    expect(pushState).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("IME 조합을 시작한 split 상세는 single로 줄어도 상세다 — 조합 중인 입력을 숨기지 않는다", async () => {
    const size = await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    await act(async () => { await userEvent.setup().click(back()); });
    await size.later(1000);
    const input = textarea("ko");
    await act(async () => { input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); });
    await size.later(500);
    expect(pane()).toBe("detail");
    expect(textarea("ko")).toBe(input);
  });

  it("상세를 쓰지 않은 폭 왕복은 목록 판을 유지한다", async () => {
    const size = await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    await act(async () => { await userEvent.setup().click(back()); });
    await size.later(1000);
    await size.later(500);
    expect(pane()).toBe("list");
  });

  it("split → single에서 숨는 목록의 포커스는 ‹ Keys로 옮긴다 — body로 빠지지 않는다", async () => {
    const size = await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 1000);
    row("k2").focus();
    await size.later(500);
    expect(pane()).toBe("detail");
    expect(document.activeElement).toBe(back());
  });

  it("넓으면 진입 착지를 하지 않는다 — split의 기존 착지 규칙 그대로", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common", 1000);
    await act(async () => { await userEvent.setup().click(row("k2")); });
    expect(document.activeElement).not.toBe(detailTitle());
  });
});

describe("외부 진입 · 트리 이동", () => {
  it("직접 key URL로 들어오면 측정 뒤 상세 제목에 착지한다", async () => {
    const size = await start("/projects/acme/surfaces/web/translations?ns=common&key=k2", null);
    expect(document.activeElement).not.toBe(detailTitle());
    await size.later(500);
    expect(document.activeElement).toBe(detailTitle());
  });

  it("검색·Inbox가 같은 소스의 키를 열면 상세 판의 제목에 착지한다 — 트리거 복귀보다 먼저다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common", 500);
    searchBox().focus();
    await external("/projects/acme/surfaces/web/translations?ns=common&key=k2");
    expect(pane()).toBe("detail");
    expect(document.activeElement).toBe(detailTitle());
  });

  it("트리에서 범위를 고르면 첫 키 응답 뒤에도 목록 판이고 선택 행에 착지한다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    await act(async () => { await user.click(back()); });
    await act(async () => { await user.click(document.querySelector<HTMLElement>(`button[aria-label="${w.tree.open}"]`)!); });
    const auth = [...document.querySelectorAll<HTMLElement>("[data-tree-ns]")].find(el => el.dataset.treeSurface === "web" && el.dataset.treeNs === "auth")!;
    await act(async () => { await user.click(auth); });
    await settle();
    expect(new URL(window.location.href).searchParams.get("key")).not.toBeNull();
    expect(pane()).toBe("list");
    expect(row("x1").getAttribute("aria-current") ?? row("x1").dataset.selected ?? "selected").toBeTruthy();
    expect(document.activeElement).toBe(row("x1"));
  });

  it("다른 소스로의 트리 이동은 재마운트 뒤에도 목록 판이다 — 의도는 한 번만 읽힌다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    await act(async () => { await user.click(back()); });
    await act(async () => { await user.click(document.querySelector<HTMLElement>(`button[aria-label="${w.tree.open}"]`)!); });
    await act(async () => { await user.click([...document.querySelectorAll<HTMLElement>("[data-tree-surface]")].find(el => el.dataset.treeSurface === "app" && el.dataset.treeNs === undefined)!); });
    await act(async () => { await user.click([...document.querySelectorAll<HTMLElement>("[data-tree-ns]")].find(el => el.dataset.treeSurface === "app" && el.dataset.treeNs === "home")!); });
    await settle();
    expect(new URL(window.location.href).pathname).toBe("/projects/acme/surfaces/app/translations");
    expect(pane()).toBe("list");
    // 같은 소스를 밖에서 다시 열면(검색·Inbox) 상세다 — 소비한 의도가 다시 목록으로 되돌리지 않는다.
    await external("/projects/acme/surfaces/app/translations?ns=home&key=a2");
    expect(pane()).toBe("detail");
  });

  it("트리 이동이 대기 중일 때 밖에서 키를 열면 상세다 — 그 이동이 의도를 대신한다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    await act(async () => { await user.click(back()); });
    hold = true;
    await act(async () => { await user.click(document.querySelector<HTMLElement>(`button[aria-label="${w.tree.open}"]`)!); });
    await act(async () => { await user.click([...document.querySelectorAll<HTMLElement>("[data-tree-ns]")].find(el => el.dataset.treeSurface === "web" && el.dataset.treeNs === "auth")!); });
    held = null;
    await external("/projects/acme/surfaces/web/translations?ns=common&key=k2");
    expect(pane()).toBe("detail");
  });
});

describe("배너 — 자리는 그대로, 상세 판에서 둘만 CSS로 숨는다 (R2)", () => {
  it("판을 오가도 배너 셋이 다시 마운트되지 않고, BasePending·EditLoss만 숨김 클래스를 든다", async () => {
    const base = serve("/projects/acme/surfaces/web/translations?ns=common&key=k1");
    stubWidth(500);
    window.history.replaceState(null, "", "/projects/acme/surfaces/web/translations?ns=common&key=k1");
    const reopensBy = new Date(Date.now() + 60_000);
    await render(<TranslationWorkspace {...base} unpublished={3} baseLocale="ko" declaredBaseLocale="en" writeLock={{ startedAt: new Date(), reopensBy }} />);
    const alerts = () => [...document.querySelectorAll<HTMLElement>("[data-alert]")].filter(el => el.closest("[data-workspace-banners]") !== null);
    const before = alerts();
    expect(before).toHaveLength(3);
    const head = document.querySelector<HTMLElement>("[data-workspace-banners]")!.parentElement!;
    expect(head.className).toMatch(/(^| )@container\/wshead( |$)/);
    const [lock, basePending, editLoss] = before;
    expect(lock!.className).not.toContain("in-data-[pane=detail]:hidden");
    for (const banner of [basePending!, editLoss!]) expect(banner.className).toContain("@max-[772px]/wshead:in-data-[pane=detail]:hidden");
    await act(async () => { await userEvent.setup().click(back()); });
    await act(async () => { await userEvent.setup().click(row("k1")); });
    expect(alerts()).toEqual(before);
    for (const banner of before) expect(banner.isConnected).toBe(true);
  });
});

/**
 * 전환 표의 나머지 세 행 (design §3 — 리뷰 B2 Y1): 필터 변경 · Save 실패/완료 · Publish/Sync/Revert. 판(`data-pane`)과 포커스를 함께 잰다.
 * ⚠️ 진짜 `disabled`의 focus fixup도 흉내 낸다(POSTMORTEM 2026-09-20) — 저장 중 꺼진 [Save]에 남은 포커스로 통과하지 않게.
 */
describe("전환 표 — 필터 · 저장 · 위험 동작 (single 500)", () => {
  let disabledFixup: MutationObserver | undefined;
  beforeEach(() => {
    disabledFixup = new MutationObserver(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
      active.removeAttribute("disabled");
      active.blur();
      active.setAttribute("disabled", "");
    });
    disabledFixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
  });
  afterEach(() => { disabledFixup?.disconnect(); });
  const statusTrigger = () => document.querySelector<HTMLButtonElement>(`button[aria-label^="${w.filters.state.axis}:"]`)!;
  const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(node => node.textContent?.trim() === label)!;
  const byText = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent?.trim() === label)!;
  const publishButton = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent?.startsWith("Publish"))!;

  it("필터 변경을 미저장 확인에서 거부하면 목록 판 · 포커스가 목록 안에 그대로다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    await user.type(textarea("zh"), "draft");
    await act(async () => { await user.click(back()); });
    await act(async () => { await user.click(statusTrigger()); });
    await act(async () => { await user.click(menuItem(w.filters.state.incomplete)); });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => { await user.click(byText(w.discard.keep)); });
    expect(pane()).toBe("list");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(listCard().contains(document.activeElement)).toBe(true);
    expect(textarea("zh").value).toBe("draft");
  });

  it("필터가 선택 키를 결과에서 빼면 목록 판이고 포커스가 목록 안에 남는다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    await act(async () => { await user.click(back()); });
    await act(async () => { await user.click(statusTrigger()); });
    await act(async () => { await user.click(menuItem(w.filters.state.incomplete)); });
    await settle();
    expect(new URL(window.location.href).searchParams.get("key")).toBeNull();
    expect(pane()).toBe("list");
    expect(listCard().contains(document.activeElement)).toBe(true);
  });

  it("Save가 성공하면 상세 판에 남고 결과 줄에 착지한다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    mocks.save.mockResolvedValue({ ok: true, cells: [{ localeCode: "zh", value: "draft" }] });
    await user.type(textarea("zh"), "draft");
    await act(async () => { await user.click(byText(w.footer.save)); });
    await settle();
    expect(pane()).toBe("detail");
    expect(document.activeElement).toBe(document.querySelector("[data-footer-result]"));
    expect(detailCard().contains(document.activeElement)).toBe(true);
  });

  it("Save가 실패하면 상세 판에 남고 다시 켜진 Save에 착지한다 — 입력은 그대로다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    mocks.save.mockResolvedValue({ ok: false, error: "failed" });
    await user.type(textarea("zh"), "draft");
    await act(async () => { await user.click(byText(w.footer.save)); });
    await settle();
    expect(pane()).toBe("detail");
    expect(document.activeElement).toBe(byText(w.footer.save));
    expect(textarea("zh").value).toBe("draft");
  });

  it("상세 판에서 Publish는 미저장 확인을 거치고, 취소하면 상세 판 · Publish 버튼으로 돌아온다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    await user.type(textarea("zh"), "draft");
    await act(async () => { await user.click(publishButton()); });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(w.publish.title);
    await act(async () => { await user.click(byText(w.publish.keep)); });
    expect(pane()).toBe("detail");
    expect(document.activeElement).toBe(publishButton());
  });

  it("상세 판에서 Sync는 미저장 확인을 거치고, 취소하면 상세 판 · Sync 버튼으로 돌아온다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    await user.type(textarea("zh"), "draft");
    await act(async () => { await user.click(byText(en.repositorySync.action)); });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(w.discard.title);
    await act(async () => { await user.click(byText(w.discard.keep)); });
    expect(pane()).toBe("detail");
    expect(document.activeElement).toBe(byText(en.repositorySync.action));
    expect(textarea("zh").value).toBe("draft");
  });

  it("상세 판에서 Revert는 확인 Dialog를 열고, 취소하면 상세 판 · Revert 버튼으로 돌아온다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const user = userEvent.setup();
    mocks.revertPreview.mockResolvedValue({ status: "ready", locales: [{ code: "ko", before: "비어 있음", after: "" }], confirmation: "c1" });
    await act(async () => { await user.click(byText(w.revert.button)); });
    await settle();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(w.revert.title);
    await act(async () => { await user.click(byText(en.common.cancel)); });
    expect(pane()).toBe("detail");
    expect(document.activeElement).toBe(byText(w.revert.button));
  });
});

/**
 * DS 대조(#228 · #229) — 단일 판 상세 머리의 경로와 키보드 열림 때의 고정 블록.
 */
describe("DS — 상세 머리 경로(#228) · 상세 판 검색 줄(#229)", () => {
  it("상세 머리: 왼쪽 8 · ‹ Keys 4/8 · 경로는 폴더가 먼저 말줄임 · 언어 필터는 줄지 않는다 — 넓으면 옛 여백 그대로", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const head = document.querySelector<HTMLElement>("[data-detail-head]")!;
    for (const token of ["px-4", "gap-2", "@max-[772px]/ws:pl-2", "@max-[772px]/ws:gap-1.5"]) expect(head.classList.contains(token)).toBe(true);
    for (const token of ["pl-1", "pr-2", "gap-1"]) expect(back().classList.contains(token)).toBe(true);
    expect(back().classList.contains("-ml-2")).toBe(false);
    const title = detailTitle();
    for (const token of ["min-w-0", "flex-1", "overflow-hidden"]) expect(title.classList.contains(token)).toBe(true);
    const [source, folder] = [...title.querySelectorAll<HTMLElement>(":scope > span")];
    expect(source!.textContent).toBe("web");
    expect(source!.classList.contains("shrink-0")).toBe(true);
    expect(folder!.textContent).toBe("common");
    for (const token of ["truncate", "min-w-[3ch]"]) expect(folder!.classList.contains(token)).toBe(true);
    const filter = title.nextElementSibling as HTMLElement;
    for (const token of ["ml-auto", "shrink-0"]) expect(filter.classList.contains(token)).toBe(true);
  });

  it("검색 줄은 단일 판의 상세에서 숨는다 — 같은 노드이고 목록 판에서는 그대로다", async () => {
    await start("/projects/acme/surfaces/web/translations?ns=common&key=k1", 500);
    const toolbar = document.querySelector<HTMLElement>("[data-toolbar]")!;
    expect(toolbar.classList.contains("@max-[772px]/wshead:in-data-[pane=detail]:hidden")).toBe(true);
    await act(async () => { await userEvent.setup().click(back()); });
    expect(pane()).toBe("list");
    expect(document.querySelector("[data-toolbar]")).toBe(toolbar);
  });
});
