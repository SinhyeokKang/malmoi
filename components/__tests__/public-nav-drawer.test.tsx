// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AttentionBadgeResult, OpenAttentionInboxResult } from "@/app/inbox/actions";
import { PublicFooter } from "@/components/public-shell/footer";
import { PublicShell } from "@/components/public-shell/public-shell";
import { AuthLayout } from "@/components/signin/auth-layout";
import { publicAccount } from "@/lib/auth/landing";
import { setUnread } from "@/lib/inbox/unread-store";
import { GITHUB_REPO_URL } from "@/lib/links";
import { routes } from "@/lib/routes";
import { WIDE_QUERY } from "@/lib/shell/breakpoint";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

vi.mock("next/navigation", () => ({ usePathname: () => "/docs", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth/sign-out", () => ({ signOutAction: async () => {} }));
const inbox = vi.hoisted(() => ({
  badge: vi.fn(async (): Promise<AttentionBadgeResult> => ({ status: "ok", unread: 0 })),
  open: vi.fn(async (): Promise<OpenAttentionInboxResult> => ({ status: "failed" })),
}));
vi.mock("@/app/inbox/actions", () => ({ loadAttentionBadgeAction: inbox.badge, openAttentionInboxAction: inbox.open }));
vi.mock("@/app/search/actions", () => ({ searchKeysAction: vi.fn(), loadSearchMembershipsAction: vi.fn(async () => ({ ok: false, error: "unavailable" })) }));
vi.mock("@/app/ui-locale/actions", () => ({ setUiLocale: vi.fn() }));
vi.mock("@/app/color-scheme/actions", () => ({ setColorScheme: vi.fn() }));

const GUEST = publicAccount({ status: "none" });
const SIGNED_IN = publicAccount({ status: "ok", userId: "u1", name: "Ada", email: "ada@x.dev", image: null, uiLocale: null, timeZone: null, colorScheme: null });

/**
 * **공개 셸의 좁은 헤더와 측면 서랍** (responsive-public PT1a·PT1b·PT1c · design §2).
 *
 * jsdom은 폭을 못 잰다 — 무엇이 어느 폭에서 보이는지는 `lg:`·`max-lg:` 클래스로 들고, 폭이 바뀌는 순간은 `matchMedia` 스텁의
 * `change`로 만든다. 서랍은 **열린 상태를 직접 렌더한다**(POSTMORTEM 2026-09-08 — 조건부로만 그려지는 가지의 조상 provider).
 * ⚠️ 포커스 단언은 focus fixup observer를 단다(POSTMORTEM 2026-09-20 — jsdom은 꺼진 요소의 포커스를 안 치운다).
 */
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

let fixup: MutationObserver;
let blockNavigation: (event: MouseEvent) => void;
beforeEach(() => {
  stubMedia(false);
  inbox.badge.mockClear();
  inbox.open.mockClear();
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    active.removeAttribute("disabled");
    active.blur();
    active.setAttribute("disabled", "");
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
  // jsdom은 링크 이동을 못 한다 — 기본 동작만 막는다(소비자의 onClick은 그대로 돈다).
  blockNavigation = (event) => { if (event.target instanceof Element && event.target.closest("a")) event.preventDefault(); };
  document.addEventListener("click", blockNavigation, true);
});
afterEach(() => {
  fixup.disconnect();
  document.removeEventListener("click", blockNavigation, true);
  vi.unstubAllGlobals();
  setUnread(0);
});

const shell = (props: Partial<Parameters<typeof PublicShell>[0]> = {}) =>
  render(h(PublicShell, { m: en, account: GUEST, children: h("h1", null, "Landing"), ...props }));
const menuButton = () => document.querySelector<HTMLButtonElement>(`header button[aria-label="${en.landing.shell.openNav}"]`)!;
const drawer = () => document.querySelector<HTMLElement>('[role="dialog"]');
const drawerLinks = () => [...(drawer()?.querySelectorAll<HTMLAnchorElement>(`nav[aria-label="${en.landing.shell.nav}"] a`) ?? [])];
const headerNav = () => document.querySelector<HTMLElement>(`header nav[aria-label="${en.landing.shell.nav}"]`)!;
const click = async (node: Element) => { await act(async () => { await userEvent.setup().click(node); }); };
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe("좁은 헤더 — 무엇이 어느 폭에 서나 (PT1a · PT1c)", () => {
  it("메뉴 버튼은 `lg` 미만에만, 내비·GitHub·구분선은 `lg` 이상에만 선다", async () => {
    await shell();
    const menu = menuButton();
    expect(menu).not.toBeNull();
    expect(menu.classList.contains("lg:hidden")).toBe(true);
    expect(menu.getAttribute("aria-haspopup")).toBe("dialog");
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(headerNav().closest(".max-lg\\:hidden")).not.toBeNull();
    const github = document.querySelector(`header a[href="${GITHUB_REPO_URL}"]`)!;
    expect(github.closest(".max-lg\\:hidden")).not.toBeNull();
    expect(document.querySelector('header [aria-hidden="true"].bg-border-subtle')?.closest(".max-lg\\:hidden")).not.toBeNull();
    // 로고는 두 폭 모두 같은 자리다.
    expect(document.querySelector(`header a[aria-label="${en.landing.shell.logo}"]`)?.closest(".max-lg\\:hidden, .lg\\:hidden")).toBeNull();
  });

  it("비로그인은 오른쪽에 검색 + Get started가 남고 라벨을 줄이지 않는다", async () => {
    await shell();
    const cta = document.querySelector<HTMLAnchorElement>(`header a[href="${routes.signIn()}"]`)!;
    expect(cta.textContent).toBe(en.landing.shell.getStarted);
    expect(cta.closest(".max-lg\\:hidden, .lg\\:hidden")).toBeNull();
    const search = document.querySelector<HTMLButtonElement>('header button[aria-label="Search"]')!;
    expect(search.classList.contains("max-lg:size-8")).toBe(true);
    expect(search.closest(".max-lg\\:hidden, .lg\\:hidden")).toBeNull();
  });

  it("로그인이면 오른쪽에 검색 · Inbox · 계정이 남는다", async () => {
    await shell({ account: SIGNED_IN });
    await settle();
    for (const label of ["Search", en.inbox.label, en.common.nav.userMenu]) {
      const node = document.querySelector(`header button[aria-label="${label}"]`);
      expect(node, label).not.toBeNull();
      expect(node?.closest(".max-lg\\:hidden, .lg\\:hidden"), label).toBeNull();
    }
  });

  /** 헤더는 좁으면 [로고][메뉴] … [검색][Inbox][계정]이다 — 가운데 검색이 오른쪽 묶음 앞에 붙는다(DOM 순서 = 보이는 순서). */
  it("`lg` 미만에서 헤더가 한 줄 flex가 되고 검색 칸이 오른쪽으로 밀린다", async () => {
    await shell();
    const bar = document.querySelector("header")!;
    expect(bar.classList.contains("max-lg:flex")).toBe(true);
    expect(bar.children[1]?.classList.contains("max-lg:ml-auto")).toBe(true);
    expect(bar.children[0]?.contains(menuButton())).toBe(true);
  });
});

describe("서랍 — 열림 (PT1b)", () => {
  it("열면 Main 서랍이 서고 Docs · Changelog · GitHub 행을 든다", async () => {
    await shell({ current: "changelog" });
    await click(menuButton());
    const dialog = drawer();
    expect(dialog).not.toBeNull();
    expect(menuButton().getAttribute("aria-expanded")).toBe("true");
    expect(dialog?.querySelector("h2")?.textContent).toBe(en.landing.shell.nav);
    expect(dialog?.querySelector("h2")?.classList.contains("sr-only")).toBe(true);
    expect(drawerLinks().map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      [en.landing.shell.docs, routes.docs()],
      [en.changelog.title, routes.changelog()],
      [en.landing.shell.github, GITHUB_REPO_URL],
    ]);
    const github = drawerLinks()[2]!;
    expect(github.getAttribute("target")).toBe("_blank");
    expect(github.getAttribute("rel")?.split(/\s+/)).toContain("noreferrer");
    // 선택 면은 그리지 않는다 — `aria-current`만.
    expect(drawerLinks().map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
    // 머리 = 로고(홈 링크) + 닫기. 바닥 = 언어·테마.
    expect(dialog?.querySelector(`a[aria-label="${en.landing.shell.logo}"]`)?.getAttribute("href")).toBe(routes.home());
    expect(dialog?.querySelector(`button[aria-label="${en.common.close}"]`)).not.toBeNull();
    expect(dialog?.textContent).toContain(`${en.uiLocale.label}: `);
    expect(dialog?.textContent).toContain(`${en.preferences.theme.title}: `);
  });

  it("측면 그릇 — 왼쪽·위·아래 8 · 폭 min(320, 100vw − 56) · radius 16 · 연한 윤곽 · scrim 40", async () => {
    await shell();
    await click(menuButton());
    const classes = [...drawer()!.classList];
    expect(classes).toEqual(expect.arrayContaining(["fixed", "top-2", "bottom-2", "left-2", "w-[min(320px,calc(100vw-56px))]", "rounded-xl", "border", "border-border-subtle", "shadow-medium"]));
    expect(document.querySelector(".bg-scrim\\/40")).not.toBeNull();
  });

  it("현재 페이지 항목에 포커스가 서고, 없으면 첫 항목이다", async () => {
    await shell({ current: "changelog" });
    await click(menuButton());
    expect(document.activeElement).toBe(drawerLinks()[1]);
  });

  it("랜딩(현재 항목 없음)은 첫 항목 Docs다", async () => {
    await shell();
    await click(menuButton());
    expect(document.activeElement).toBe(drawerLinks()[0]);
  });

  it("검색·Inbox·계정은 서랍에 들어가지 않는다 — 헤더에 한 벌이고 배지 Action도 한 번이다", async () => {
    await shell({ account: SIGNED_IN });
    await settle();
    await click(menuButton());
    await settle();
    expect(document.querySelectorAll('button[aria-label="Search"]')).toHaveLength(1);
    expect(drawer()?.querySelector('button[aria-label="Search"]')).toBeNull();
    expect(document.querySelectorAll(`button[aria-label="${en.inbox.label}"]`)).toHaveLength(1);
    expect(document.querySelectorAll(`button[aria-label="${en.common.nav.userMenu}"]`)).toHaveLength(1);
    expect(inbox.badge).toHaveBeenCalledTimes(1);
  });
});

describe("서랍 — 닫힘과 포커스 (design §2)", () => {
  it("Esc로 닫으면 메뉴 버튼으로 돌아간다", async () => {
    await shell();
    await click(menuButton());
    await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });

  it("닫기 버튼으로 닫으면 메뉴 버튼으로 돌아간다", async () => {
    await shell();
    await click(menuButton());
    await click(drawer()!.querySelector(`button[aria-label="${en.common.close}"]`)!);
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });

  it("조합 중 Esc는 닫지 않는다 (C9)", async () => {
    await shell();
    await click(menuButton());
    const dialog = drawer()!;
    await act(async () => { dialog.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); });
    await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, isComposing: true })); });
    expect(drawer()).not.toBeNull();
  });

  it("안쪽 링크로 닫히면 메뉴 버튼으로 돌아가지 않는다 — 도착한 페이지가 포커스를 가진다", async () => {
    await shell();
    await click(menuButton());
    await click(drawerLinks()[1]!);
    expect(drawer()).toBeNull();
    expect(document.activeElement).not.toBe(menuButton());
  });

  it("열린 동안만 `lg` 리스너를 단다", async () => {
    await shell();
    expect(media.listeners.size).toBe(0);
    await click(menuButton());
    expect(media.listeners.size).toBe(1);
    await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
    expect(media.listeners.size).toBe(0);
  });

  it("넓어지면 닫고 고정 내비의 현재 링크로 포커스를 옮긴다", async () => {
    await shell({ current: "docs" });
    await click(menuButton());
    await media.set(true);
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(headerNav().querySelector(`a[href="${routes.docs()}"]`));
    // 서랍의 리스너는 떨어지고, 남은 하나는 포커스가 들어온 고정 내비(`WideOnly`)의 것이다 — 다시 좁아지면 메뉴 버튼으로 넘긴다.
    expect(media.listeners.size).toBe(1);
    await media.set(false);
    expect(document.activeElement).toBe(menuButton());
  });

  it("넓어질 때 서랍의 GitHub에 있었으면 헤더 GitHub로 간다", async () => {
    await shell({ current: "docs" });
    await click(menuButton());
    await act(async () => { drawerLinks()[2]!.focus(); });
    await media.set(true);
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(document.querySelector(`header a[href="${GITHUB_REPO_URL}"]`));
  });

  it("넓어질 때 대응 링크가 없으면(랜딩) 본문으로 간다 — body로 빠지지 않는다", async () => {
    await shell();
    await click(menuButton());
    await act(async () => { drawer()!.querySelector<HTMLElement>(`button[aria-label="${en.common.close}"]`)!.focus(); });
    await media.set(true);
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(document.querySelector("[data-public-scroller]"));
  });
});

/**
 * **#213 — 브라우저에서는 Esc·닫기·배경 뒤 스크롤러로 갔다**(jsdom green · 브라우저 red, POSTMORTEM 2026-09-20 유형). Chromium은 포커스된 노드를 떼면
 * `focusout`(relatedTarget 없음)을 바로 쏘고, 셸 스크롤러가 그것을 받아 `body`의 포커스를 되찾는다 — 그 focusin이 Dialog의 "최근 기록" 맨 끝이 되어
 * Radix 복귀(`setTimeout` 뒤)가 스크롤러로 갔다. jsdom은 떼어도 `focusout`을 안 쏘므로 여기서 그 순서를 흉내 낸다(`removeChild` 감시).
 */
describe("#213 — 브라우저 순서에서도 닫힘은 메뉴 버튼으로", () => {
  let restore: () => void = () => {};
  beforeEach(() => {
    const original = Node.prototype.removeChild;
    Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
      const active = document.activeElement;
      const had = active !== null && active !== document.body && child.contains(active);
      const removed = original.call(this, child) as T;
      if (had) document.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
      return removed;
    };
    restore = () => { Node.prototype.removeChild = original; };
  });
  afterEach(() => restore());

  it("Esc", async () => {
    await shell({ current: "docs" });
    await click(menuButton());
    await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
    await settle();
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });

  it("닫기 버튼", async () => {
    await shell({ current: "docs" });
    await click(menuButton());
    await click(drawer()!.querySelector(`button[aria-label="${en.common.close}"]`)!);
    await settle();
    expect(document.activeElement).toBe(menuButton());
  });

  it("배경", async () => {
    await shell({ current: "docs" });
    await click(menuButton());
    const overlay = document.querySelector<HTMLElement>(".bg-scrim\\/40")!;
    await act(async () => { overlay.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
    await settle();
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });

  it("링크로 닫히면 여전히 메뉴 버튼으로 가지 않는다", async () => {
    await shell({ current: "docs" });
    await click(menuButton());
    await click(drawerLinks()[1]!);
    await settle();
    expect(drawer()).toBeNull();
    expect(document.activeElement).not.toBe(menuButton());
  });
});

describe("좁아지며 숨는 링크의 포커스 (design §2)", () => {
  beforeEach(() => { stubMedia(true); });

  it("헤더 내비에 포커스가 있었으면 메뉴 버튼으로 옮긴다", async () => {
    await shell({ current: "docs" });
    const docs = headerNav().querySelector<HTMLAnchorElement>("a")!;
    await act(async () => { docs.focus(); });
    expect(media.listeners.size).toBe(1);
    await media.set(false);
    expect(document.activeElement).toBe(menuButton());
    expect(media.listeners.size).toBe(0);
  });

  it("헤더 GitHub도 같다", async () => {
    await shell();
    await act(async () => { document.querySelector<HTMLElement>(`header a[href="${GITHUB_REPO_URL}"]`)!.focus(); });
    await media.set(false);
    expect(document.activeElement).toBe(menuButton());
  });

  it("푸터 스위처(서랍 바닥으로 가는 것)도 같다", async () => {
    await shell();
    const language = [...document.querySelectorAll<HTMLButtonElement>("footer button")].find((button) => button.textContent?.startsWith(`${en.uiLocale.label}: `))!;
    await act(async () => { language.focus(); });
    await media.set(false);
    expect(document.activeElement).toBe(menuButton());
  });

  it("숨지 않는 곳에 포커스가 있으면 리스너도 없고 옮기지도 않는다", async () => {
    await shell();
    const cta = document.querySelector<HTMLAnchorElement>(`header a[href="${routes.signIn()}"]`)!;
    await act(async () => { cta.focus(); });
    expect(media.listeners.size).toBe(0);
    await media.set(false);
    expect(document.activeElement).toBe(cta);
  });
});

/**
 * **#214 — 브라우저에서는 1025→1023에서 body로 빠졌다.** Chromium은 MQL `change`보다 먼저 스타일을 다시 계산해 숨은 링크에서 `blur`(relatedTarget 없음)를
 * 쏠 수 있고, 그때 리스너를 떼면 `change`가 와도 넘길 사람이 없다. 그리고 푸터 스위처 메뉴를 연 채 좁히면 숨은 트리거에 붙은 메뉴가 남았다.
 * jsdom은 스타일 재계산이 없으므로 묶음을 `display: none`으로 만든 뒤 `blur()`로 그 순서를 만든다.
 */
describe("#214 — 숨김이 `change`보다 먼저 와도, 메뉴가 열려 있어도", () => {
  beforeEach(() => { stubMedia(true); });

  it("숨겨져서 잃은 포커스는 `change`를 기다리지 않고 메뉴 버튼으로 간다", async () => {
    await shell({ current: "docs" });
    const docs = headerNav().querySelector<HTMLAnchorElement>("a")!;
    await act(async () => { docs.focus(); });
    const wrapper = headerNav().parentElement!;
    wrapper.style.display = "none";
    await act(async () => { docs.blur(); });
    expect(document.activeElement).toBe(menuButton());
    await media.set(false);
    expect(document.activeElement).toBe(menuButton());
    expect(media.listeners.size).toBe(0);
  });

  it("빈 곳을 눌러 잃은 포커스(숨지 않음)는 건드리지 않고 리스너를 뗀다", async () => {
    await shell({ current: "docs" });
    const docs = headerNav().querySelector<HTMLAnchorElement>("a")!;
    await act(async () => { docs.focus(); });
    await act(async () => { docs.blur(); });
    expect(document.activeElement).not.toBe(menuButton());
    expect(media.listeners.size).toBe(0);
  });

  it("푸터 스위처 메뉴가 열린 채 좁아지면 메뉴를 닫고 메뉴 버튼으로 간다", async () => {
    await shell();
    const language = [...document.querySelectorAll<HTMLButtonElement>("footer button")].find((button) => button.textContent?.startsWith(`${en.uiLocale.label}: `))!;
    await click(language);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(media.listeners.size).toBe(1);
    await media.set(false);
    for (let tries = 0; document.activeElement !== menuButton() && tries < 10; tries++) await settle();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(menuButton());
    expect(media.listeners.size).toBe(0);
  });
});

/**
 * **#214 재실측 — Chrome은 `focusout`/`blur`를 하나도 쏘지 않는다.** 숨겨진 노드의 포커스를 focus fixup이 조용히 `body`로 옮기고, MQL `change`가 올 때는
 * 이미 `activeElement === body`다. 래퍼 안이었다는 사실을 기억해야 넘길 수 있다. jsdom에는 fixup이 없으므로 `activeElement`를 `body`로 덮어 그 순간을 만든다.
 */
async function narrowAfterSilentFixup() {
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => document.body });
  try {
    await media.set(false);
  } finally {
    Reflect.deleteProperty(document, "activeElement");
  }
}

describe("#214 — blur 없이 body로 간 뒤의 `change`", () => {
  beforeEach(() => { stubMedia(true); });

  it("헤더 내비", async () => {
    await shell({ current: "docs" });
    await act(async () => { headerNav().querySelector<HTMLAnchorElement>("a")!.focus(); });
    await narrowAfterSilentFixup();
    expect(document.activeElement).toBe(menuButton());
    expect(media.listeners.size).toBe(0);
  });

  it("헤더 GitHub", async () => {
    await shell();
    await act(async () => { document.querySelector<HTMLElement>(`header a[href="${GITHUB_REPO_URL}"]`)!.focus(); });
    await narrowAfterSilentFixup();
    expect(document.activeElement).toBe(menuButton());
  });

  it("푸터 스위처", async () => {
    await shell();
    const theme = [...document.querySelectorAll<HTMLButtonElement>("footer button")].find((button) => button.textContent?.startsWith(`${en.preferences.theme.title}: `))!;
    await act(async () => { theme.focus(); });
    await narrowAfterSilentFixup();
    expect(document.activeElement).toBe(menuButton());
  });

  it("포커스가 이미 다른 곳으로 옮겨 갔으면(실제 blur) 넘기지 않는다", async () => {
    await shell();
    const cta = document.querySelector<HTMLAnchorElement>(`header a[href="${routes.signIn()}"]`)!;
    await act(async () => { headerNav().querySelector<HTMLAnchorElement>("a")!.focus(); });
    await act(async () => { cta.focus(); });
    await media.set(false);
    expect(document.activeElement).toBe(cta);
  });

  /** 포인터로 연 메뉴는 트리거에 포커스가 서지 않는다(Radix가 pointerdown 기본 동작을 막는다) — 그 경로에서도 좁아지면 닫힌다. */
  it("포인터로 연 푸터 메뉴(트리거 포커스 없음)도 좁아지면 닫고 메뉴 버튼으로 간다", async () => {
    await shell();
    const language = [...document.querySelectorAll<HTMLButtonElement>("footer button")].find((button) => button.textContent?.startsWith(`${en.uiLocale.label}: `))!;
    await act(async () => { await userEvent.setup().pointer({ keys: "[MouseLeft]", target: language }); });
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await narrowAfterSilentFixup();
    for (let tries = 0; document.activeElement !== menuButton() && tries < 10; tries++) await settle();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });
});

describe("푸터 — 공개 셸은 왼쪽 묶음만, Auth는 두 줄 감김 (PT1a · PT3a)", () => {
  it("공개 셸 푸터는 `lg` 미만에서 스위처 묶음을 숨긴다(서랍 바닥에 있다)", async () => {
    await shell();
    const footer = document.querySelector("footer")!;
    const groups = [...footer.children];
    expect(groups).toHaveLength(2);
    expect(groups[0]?.closest(".max-lg\\:hidden")).toBeNull();
    expect(groups[1]?.classList.contains("max-lg:hidden")).toBe(true);
    expect(footer.classList.contains("max-lg:flex-wrap")).toBe(false);
    // 한 줄 형은 그대로다 — 줄 높이를 바꾸지 않는다.
    expect(footer.outerHTML).not.toMatch(/max-lg:leading-|max-lg:min-h-5/);
  });

  it("기본(Auth) 푸터는 숨기지 않고 `lg` 미만에서 두 줄로 감긴다", () => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(h(AuthLayout, { m: en, children: null }));
    const footer = root.querySelector("footer")!;
    expect(footer.outerHTML).not.toContain("max-lg:hidden");
    // 두 줄 형의 줄 높이는 20이다(#219 · 시안 PT3: 10 + 20 + 4 + 20 + 10 = 64) — `text-xs`의 기본 행간(≈17.3)이면 58.7이었다.
    expect([...footer.classList]).toEqual(expect.arrayContaining(["h-10", "max-lg:h-auto", "max-lg:flex-wrap", "max-lg:gap-y-1", "max-lg:py-2.5", "max-lg:leading-5"]));
    expect([...footer.children].map((group) => group.classList.contains("max-lg:min-h-5"))).toEqual([true, true]);
    expect(renderToStaticMarkup(h(PublicFooter, { m: en }))).not.toContain("max-lg:hidden");
  });
});
