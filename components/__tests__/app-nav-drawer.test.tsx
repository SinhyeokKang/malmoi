// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import type { AttentionBadgeResult, OpenAttentionInboxResult } from "@/app/inbox/actions";
import { Header } from "@/components/shell/header";
import { ShellPanels } from "@/components/shell/shell-panels";
import { Sidebar } from "@/components/shell/sidebar";
import { setUnread } from "@/lib/inbox/unread-store";
import { routes } from "@/lib/routes";
import { WIDE_QUERY } from "@/lib/shell/breakpoint";
import type { NavProject } from "@/lib/shell/nav";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

/**
 * **앱 셸의 좁은 형 — 헤더 · LNB 서랍 · 숨는 고정 LNB** (responsive-app A2 · design §2 · 시안 AT1).
 *
 * jsdom은 폭을 못 잰다 — 무엇이 어느 폭에서 보이는지는 `lg:`·`max-lg:` 클래스로 들고, 폭이 바뀌는 순간은 `matchMedia` 스텁의 `change`로 만든다.
 * 서랍은 **열린 상태를 직접 렌더한다**(POSTMORTEM 2026-09-08 — 좁은 폭에서만 그려지는 가지의 조상 provider).
 * ⚠️ 포커스 단언은 focus fixup observer를 단다(POSTMORTEM 2026-09-20 — jsdom은 꺼진 요소의 포커스를 안 치운다).
 */
const path = vi.hoisted(() => ({ value: "/projects/beta" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.value, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}));
const inbox = vi.hoisted(() => ({
  badge: vi.fn(async (): Promise<AttentionBadgeResult> => ({ status: "ok", unread: 0 })),
  open: vi.fn(async (): Promise<OpenAttentionInboxResult> => ({ status: "failed" })),
}));
vi.mock("@/app/inbox/actions", () => ({ loadAttentionBadgeAction: inbox.badge, openAttentionInboxAction: inbox.open }));
const search = vi.hoisted(() => ({ memberships: vi.fn(async () => ({ ok: false, error: "unavailable" })) }));
vi.mock("@/app/search/actions", () => ({ searchKeysAction: vi.fn(), loadSearchMembershipsAction: search.memberships }));

type Listener = (event: { matches: boolean }) => void;
let media: { wide: boolean; listeners: Set<Listener>; set: (wide: boolean) => Promise<void> };
function stubMedia(wide: boolean) {
  const listeners = new Set<Listener>();
  media = {
    wide,
    listeners,
    set: async (next: boolean) => {
      media.wide = next;
      await act(async () => { for (const listener of [...listeners]) listener({ matches: next }); });
      // Radix FocusScope는 닫힘 자동 포커스를 `setTimeout(0)` 뒤에 쏜다 — 한 틱을 넘긴다.
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    },
  };
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() { return query === WIDE_QUERY ? media.wide : false; },
    addEventListener: (type: string, listener: Listener) => { if (query === WIDE_QUERY && type === "change") listeners.add(listener); },
    removeEventListener: (type: string, listener: Listener) => { if (type === "change") listeners.delete(listener); },
  }));
}

/** 셸 그룹을 재는 `ResizeObserver` — 전역 mock은 콜백을 안 부르므로 테스트가 폭을 쏜다. */
let observed: ((width: number) => Promise<void>) | null = null;
function stubResize() {
  observed = null;
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe() {
      observed = async (width: number) => {
        await act(async () => { this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver); });
      };
    }
    unobserve() {}
    disconnect() {}
  });
}

let fixup: MutationObserver;
let blockNavigation: (event: MouseEvent) => void;
/** jsdom에는 패널 치수가 없어 라이브러리의 `setLayout`이 "Invalid N panel layout"을 던진다 — 그 호출 수가 곧 셸이 레이아웃을 건드린 횟수다. */
let layouts = 0;
beforeEach(() => {
  path.value = "/projects/beta";
  stubMedia(false);
  stubResize();
  inbox.badge.mockClear();
  search.memberships.mockClear();
  document.cookie = "malmoi-sidebar-collapsed=; Path=/; Max-Age=0";
  layouts = 0;
  const swallow = (event: ErrorEvent) => {
    if (/Invalid \d+ panel layout/.test(event.message)) { layouts += 1; event.preventDefault(); }
  };
  window.addEventListener("error", swallow);
  onTestFinished(() => window.removeEventListener("error", swallow));
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    active.removeAttribute("disabled");
    active.blur();
    active.setAttribute("disabled", "");
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
  blockNavigation = (event) => { if (event.target instanceof Element && event.target.closest("a")) event.preventDefault(); };
  document.addEventListener("click", blockNavigation, true);
});
afterEach(() => {
  fixup.disconnect();
  document.removeEventListener("click", blockNavigation, true);
  vi.unstubAllGlobals();
  setUnread(0);
});

const project = (slug: string, extra: Partial<NavProject> = {}): NavProject => ({
  slug, name: `${slug[0]!.toUpperCase()}${slug.slice(1)}`, role: "OWNER", archived: false, image: null, ...extra,
});
const memberships: NavProject[] = [project("acme"), project("beta")];

/** 콘텐츠 자리의 상태 — 재마운트되면 0으로 돌아간다. */
function Counter() {
  const [n, setN] = useState(0);
  return <main><button type="button" data-counter onClick={() => setN(n + 1)}>{n}</button></main>;
}

const shellTree = (initialCollapsed = false) => (
  <>
    <Header m={en} name="Kim" email="kim@acme.com" image={null} signOut={vi.fn()} memberships={memberships} />
    <ShellPanels initialCollapsed={initialCollapsed} sidebar={<Sidebar memberships={memberships} userName="Kim" />}>
      <Counter />
    </ShellPanels>
  </>
);
const mount = (initialCollapsed = false) => render(shellTree(initialCollapsed));

const menuButton = () => document.querySelector<HTMLButtonElement>(`header button[aria-label="${en.landing.shell.openNav}"]`)!;
const drawer = () => document.querySelector<HTMLElement>('[role="dialog"]');
const fixedAside = () => document.querySelector<HTMLElement>("[data-app-sidebar] aside")!;
const click = async (node: Element) => { await act(async () => { await userEvent.setup().click(node); }); };
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const open = async () => { await click(menuButton()); await settle(); };

describe("앱 헤더 — 좁은 형 (AT1a)", () => {
  it("compact 헤더다 — `lg` 미만 한 줄 flex · 검색은 아이콘", async () => {
    await mount();
    const bar = document.querySelector("header")!;
    expect(bar.classList.contains("max-lg:flex")).toBe(true);
    const searchButton = document.querySelector<HTMLButtonElement>('header button[aria-label="Search"]')!;
    expect(searchButton.classList.contains("max-lg:size-8")).toBe(true);
  });

  it("메뉴 버튼은 로고 옆 · `lg` 미만에만 서고 서랍을 연다", async () => {
    await mount();
    const menu = menuButton();
    expect(menu.classList.contains("lg:hidden")).toBe(true);
    expect(menu.getAttribute("aria-haspopup")).toBe("dialog");
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    const logo = document.querySelector(`header a[aria-label="${en.common.nav.appHome}"]`)!;
    expect(logo.parentElement).toBe(menu.parentElement);
    expect(logo.closest(".lg\\:hidden, .max-lg\\:hidden")).toBeNull();
  });

  it("New project 링크와 세로선은 `lg` 이상에만 선다 — 좁으면 서랍으로 간다", async () => {
    await mount();
    expect(document.querySelector(`header a[href="${routes.newProject()}"]`)?.closest(".max-lg\\:hidden")).not.toBeNull();
    expect(document.querySelector('header [aria-hidden="true"].bg-border-subtle')?.closest(".max-lg\\:hidden")).not.toBeNull();
    // 검색·Inbox·계정은 두 폭 모두 같은 인스턴스다.
    for (const label of ["Search", en.inbox.label, en.common.nav.userMenu]) {
      expect(document.querySelector(`header button[aria-label="${label}"]`)?.closest(".max-lg\\:hidden, .lg\\:hidden"), label).toBeNull();
    }
  });
});

describe("고정 LNB — `lg` 미만 CSS로 숨고 언제나 마운트된다 (design §2)", () => {
  it("LNB 패널·핸들이 `max-lg:hidden`이고 핸들이 `touch-none`이다", async () => {
    await mount();
    const panel = document.querySelector("[data-app-sidebar]")!.parentElement!;
    expect(panel.classList.contains("max-lg:hidden")).toBe(true);
    expect(document.querySelector("[data-app-sidebar]")?.classList.contains("max-lg:hidden")).toBe(true);
    const handle = document.querySelector<HTMLElement>('[role="separator"]')!;
    expect(handle.classList.contains("max-lg:hidden")).toBe(true);
    expect(handle.classList.contains("touch-none")).toBe(true);
  });

  // 폭이 오갈 때의 재마운트 0 · `setLayout`·`onResize` 건너뜀은 `shell-panels-narrow.test.tsx`가 잰다(라이브러리를 대역으로 바꿔야 잴 수 있다).

  it("서랍을 열고 닫아도 접힘 쿠키를 쓰지 않는다", async () => {
    await mount(true);
    await open();
    await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
    await observed?.(700);
    expect(document.cookie).not.toContain("malmoi-sidebar-collapsed");
  });
});

describe("서랍 — 지금 LNB 그대로 (AT1b · AT1d)", () => {
  it("구역 둘(사용자 · 프로젝트)을 들고 항목·순서가 고정 LNB와 같다", async () => {
    await mount();
    await open();
    const dialog = drawer()!;
    expect(dialog.querySelector("h2")?.textContent).toBe(en.landing.shell.nav);
    const zones = [...dialog.querySelectorAll<HTMLElement>("nav[data-sidebar-zone]")].map((nav) => nav.getAttribute("aria-label"));
    expect(zones).toEqual(["Kim", "Beta"]);
    const labels = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("nav[data-sidebar-zone] a")].map((a) => a.getAttribute("href"));
    expect(labels(dialog)).toEqual(labels(fixedAside()));
  });

  it("행이 40이고 줄바꿈한다 — 터치 44는 `::after`", async () => {
    await mount();
    await open();
    for (const link of drawer()!.querySelectorAll<HTMLElement>("nav[data-sidebar-zone] a")) {
      expect(link.classList.contains("min-h-10"), link.textContent ?? "").toBe(true);
      expect(link.classList.contains("h-8")).toBe(false);
      expect(link.classList.contains("whitespace-nowrap")).toBe(false);
      expect(link.className).toContain("pointer-coarse:after:");
    }
  });

  it("데스크톱에서 접어 둔 사용자도 서랍에서는 펼친 라벨이다 — 접기 토글이 없다", async () => {
    await mount(true);
    expect(fixedAside().hasAttribute("data-collapsed")).toBe(true);
    await open();
    const dialog = drawer()!;
    expect(dialog.querySelector("[data-collapsed]")).toBeNull();
    expect(dialog.querySelector("[inert] [data-zone-head]")).toBeNull();
    expect(dialog.querySelector("[data-zone-head]")?.textContent).toContain("Beta");
    expect(dialog.querySelector("[title]")).toBeNull();
    expect(dialog.querySelector("button[aria-expanded]:not([aria-haspopup])")).toBeNull();
    expect(dialog.textContent).not.toContain(en.common.nav.expandSidebar);
    expect(dialog.textContent).not.toContain(en.common.nav.collapseSidebar);
  });

  it("바닥은 몸통 밖 고정이고 New project · Changelog · Docs다", async () => {
    await mount();
    await open();
    const footer = drawer()!.querySelector<HTMLElement>("[data-drawer-pinned]")!;
    expect(footer.closest(".overflow-y-auto")).toBeNull();
    expect([...footer.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([routes.newProject(), routes.changelog(), routes.docs()]);
    for (const link of footer.querySelectorAll<HTMLElement>("a")) expect(link.classList.contains("min-h-10")).toBe(true);
  });

  it("프로젝트 밖에서는 목록 구역이 New project로 끝나 바닥에 다시 두지 않는다 (AT1d)", async () => {
    path.value = "/inbox";
    await mount();
    await open();
    const dialog = drawer()!;
    const list = dialog.querySelector<HTMLElement>(`nav[aria-label="${en.common.nav.yourProjects}"]`)!;
    expect(list.querySelector("a:last-of-type")?.getAttribute("href")).toBe(routes.newProject());
    const footer = dialog.querySelector<HTMLElement>("[data-drawer-pinned]")!;
    expect([...footer.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([routes.changelog(), routes.docs()]);
    // 열면 Inbox(현재 항목)에 포커스가 선다.
    expect(document.activeElement?.getAttribute("href")).toBe(routes.inbox());
  });

  it("열면 현재 항목(Home)에 포커스가 선다", async () => {
    await mount();
    await open();
    expect(document.activeElement?.getAttribute("aria-current")).toBe("page");
    expect(document.activeElement?.getAttribute("href")).toBe(routes.project("beta"));
    expect(drawer()!.contains(document.activeElement)).toBe(true);
  });

  it("검색·Inbox·계정은 서랍에 들어가지 않는다 — 헤더에 한 벌이고 Action도 늘지 않는다", async () => {
    await mount();
    await settle();
    const before = inbox.badge.mock.calls.length;
    await open();
    expect(document.querySelectorAll('button[aria-label="Search"]')).toHaveLength(1);
    expect(document.querySelectorAll(`button[aria-label="${en.inbox.label}"]`)).toHaveLength(1);
    expect(document.querySelectorAll(`button[aria-label="${en.common.nav.userMenu}"]`)).toHaveLength(1);
    expect(inbox.badge.mock.calls.length).toBe(before);
    expect(search.memberships).not.toHaveBeenCalled();
  });

  it("프로젝트 전환 — 머리 chevron이 32로 서고 아래로 열며, 고르면 메뉴·서랍이 함께 닫힌다", async () => {
    await mount();
    await open();
    const trigger = drawer()!.querySelector<HTMLButtonElement>(`[data-zone-head] button[aria-label="${en.common.nav.projectSwitcher.label}"]`)!;
    expect(trigger.classList.contains("size-8")).toBe(true);
    await click(trigger);
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    expect(menu.getAttribute("data-side")).toBe("bottom");
    expect(drawer()).not.toBeNull();
    await click(menu.querySelector(`a[href="${routes.project("acme")}"]`)!);
    await settle();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(drawer()).toBeNull();
    expect(document.activeElement).not.toBe(menuButton());
  });
});

/**
 * **서랍에서 누른 행을 숨은 고정 LNB가 자기 누름으로 읽지 않는다** (`sidebar.tsx`의 `pressedZone` 좁히기). 서랍과 고정 LNB가 같은 문서에 둘이라,
 * 문서 전체에서 구역을 읽으면 서랍의 목록 행 클릭 → 이동(구역 `projects` → `project`)에서 숨은 고정 LNB가 "내 구역에서 눌렀다"며 `display:none`인
 * 자기 현재 항목에 착지하려 든다 — 브라우저는 그 포커스를 `body`로 떨군다(#214 유형). 서랍은 링크로 닫히고 도착한 화면이 포커스를 가진다.
 */
describe("서랍 누름 — 숨은 고정 LNB가 가로채지 않는다", () => {
  it("서랍의 목록 행으로 다른 프로젝트에 가도 포커스가 고정 LNB 안에 앉지 않는다", async () => {
    path.value = "/inbox";
    const view = await mount();
    await open();
    const row = drawer()!.querySelector<HTMLAnchorElement>(`nav[aria-label="${en.common.nav.yourProjects}"] a[href="${routes.project("acme")}"]`)!;
    await click(row);
    await settle();
    expect(drawer()).toBeNull();
    path.value = "/projects/acme";
    await view.rerender(shellTree());
    await settle();
    expect(fixedAside().querySelector(`nav[data-sidebar-zone="project"]`)).not.toBeNull();
    expect(document.querySelector("[data-app-sidebar]")?.contains(document.activeElement)).toBe(false);
  });

  it("고정 LNB 자신의 목록 행이면 지금처럼 새 구역의 현재 항목에 앉는다 — 좁히기가 고정 LNB 착지를 막지 않는다", async () => {
    stubMedia(true);
    path.value = "/inbox";
    const view = await mount();
    const row = fixedAside().querySelector<HTMLAnchorElement>(`nav[aria-label="${en.common.nav.yourProjects}"] a[href="${routes.project("acme")}"]`)!;
    await click(row);
    path.value = "/projects/acme";
    await view.rerender(shellTree());
    expect(document.activeElement).toBe(fixedAside().querySelector(`nav[data-sidebar-zone="project"] [aria-current="page"]`));
  });
});

describe("서랍 — 닫힘과 포커스", () => {
  it("Esc·닫기는 메뉴 버튼으로 돌아간다", async () => {
    await mount();
    await open();
    await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(menuButton());
    await open();
    await click(drawer()!.querySelector(`button[aria-label="${en.common.close}"]`)!);
    expect(document.activeElement).toBe(menuButton());
  });

  it("안쪽 링크로 닫히면 메뉴 버튼으로 돌아가지 않는다 — 도착한 화면이 포커스를 가진다", async () => {
    await mount();
    await open();
    await click(drawer()!.querySelector(`a[href="${routes.logs("beta")}"]`)!);
    await settle();
    expect(drawer()).toBeNull();
    expect(document.activeElement).not.toBe(menuButton());
  });

  it("넓어지면 닫고 고정 LNB의 같은 항목으로 포커스를 옮긴다", async () => {
    await mount();
    await open();
    await act(async () => { drawer()!.querySelector<HTMLElement>(`a[href="${routes.logs("beta")}"]`)!.focus(); });
    await media.set(true);
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(fixedAside().querySelector(`a[href="${routes.logs("beta")}"]`));
  });

  it("넓어질 때 대응 항목이 없으면 고정 LNB의 현재 항목으로 간다", async () => {
    await mount();
    await open();
    await act(async () => { drawer()!.querySelector<HTMLElement>(`button[aria-label="${en.common.close}"]`)!.focus(); });
    await media.set(true);
    expect(document.activeElement).toBe(fixedAside().querySelector('[aria-current="page"]'));
  });
});

describe("좁아지며 숨는 고정 LNB의 포커스 (useNarrowHandoff)", () => {
  beforeEach(() => { stubMedia(true); });

  it("고정 LNB에 포커스가 있었으면 메뉴 버튼으로 옮긴다", async () => {
    await mount();
    await act(async () => { fixedAside().querySelector<HTMLElement>(`a[href="${routes.logs("beta")}"]`)!.focus(); });
    await media.set(false);
    expect(document.activeElement).toBe(menuButton());
  });

  it("blur 없이 body로 간 뒤의 `change`(Chrome)도 메뉴 버튼으로 간다", async () => {
    await mount();
    await act(async () => { fixedAside().querySelector<HTMLElement>("a")!.focus(); });
    Object.defineProperty(document, "activeElement", { configurable: true, get: () => document.body });
    try {
      await media.set(false);
    } finally {
      Reflect.deleteProperty(document, "activeElement");
    }
    expect(document.activeElement).toBe(menuButton());
  });

  it("헤더 New project(`AppWideOnly`)에 포커스가 있었으면 메뉴 버튼으로 옮긴다", async () => {
    await mount();
    const link = document.querySelector<HTMLAnchorElement>(`header a[href="${routes.newProject()}"]`)!;
    await act(async () => { link.focus(); });
    await media.set(false);
    expect(document.activeElement).toBe(menuButton());
  });

  it("헤더 New project — blur 없이 body로 간 뒤의 `change`(Chrome)도 메뉴 버튼으로 간다", async () => {
    await mount();
    await act(async () => { document.querySelector<HTMLAnchorElement>(`header a[href="${routes.newProject()}"]`)!.focus(); });
    Object.defineProperty(document, "activeElement", { configurable: true, get: () => document.body });
    try {
      await media.set(false);
    } finally {
      Reflect.deleteProperty(document, "activeElement");
    }
    expect(document.activeElement).toBe(menuButton());
  });

  it("고정 LNB 밖에 포커스가 있으면 옮기지 않는다", async () => {
    await mount();
    const counter = document.querySelector<HTMLButtonElement>("[data-counter]")!;
    await act(async () => { counter.focus(); });
    await media.set(false);
    expect(document.activeElement).toBe(counter);
  });
});
