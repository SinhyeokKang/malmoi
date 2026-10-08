// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { act, createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setUnread } from "@/lib/inbox/unread-store";

import type { AttentionBadgeResult, OpenAttentionInboxResult } from "@/app/inbox/actions";
import { PublicFooter } from "@/components/public-shell/footer";
import { PublicShell } from "@/components/public-shell/public-shell";
import { AuthLayout } from "@/components/signin/auth-layout";
import { publicAccount } from "@/lib/auth/landing";
import { en } from "@/messages/en";
import { footerLinks, GITHUB_REPO_URL } from "@/lib/links";
import { routes } from "@/lib/routes";

vi.mock("next/navigation", () => ({ usePathname: () => "/docs" }));

import { render } from "./helpers/dom";

// 헤더가 로그아웃 Action을 참조로 넘긴다 — 실물은 `@/auth`를 물어 jsdom에서 세울 수 없다.
vi.mock("@/lib/auth/sign-out", () => ({ signOutAction: async () => {} }));
// 헤더 Inbox(로그인일 때만)의 Action 둘 — 배지 호출 수로 "비로그인 방문자에게는 부르지 않는다"를 센다.
const inbox = vi.hoisted(() => ({
  badge: vi.fn(async (): Promise<AttentionBadgeResult> => ({ status: "failed" })),
  open: vi.fn(async (): Promise<OpenAttentionInboxResult> => ({ status: "failed" })),
}));
vi.mock("@/app/inbox/actions", () => ({ loadAttentionBadgeAction: inbox.badge, openAttentionInboxAction: inbox.open }));
// 사용자 메뉴의 프로젝트 그룹은 열기 직전에 읽는다(user-menu-projects D2) — 렌더·마운트만으로는 0이어야 한다.
const search = vi.hoisted(() => ({ memberships: vi.fn(async () => ({ ok: false as const, error: "unavailable" as const })) }));
vi.mock("@/app/search/actions", () => ({ searchKeysAction: vi.fn(), loadSearchMembershipsAction: search.memberships }));

const GUEST = publicAccount({ status: "none" });
const SIGNED_IN = publicAccount({ status: "ok", userId: "u1", name: "Ada", email: "ada@x.dev", image: null, uiLocale: null, timeZone: null, colorScheme: null });

/**
 * 공개 셸 (DESIGN §6.615) — 헤더 · 패널(표면 + 스크롤러) · 푸터. 랜딩(`/`)과 `/privacy`가 쓴다.
 *
 * ⚠️ **문서가 스크롤되지 않는 셸이라 스크롤러가 포커스를 받아야 키보드 스크롤이 산다** — body에
 * 포커스가 있으면 Space/PageDown이 root scroller만 민다(DESIGN §6.615 "키보드").
 */
/** 랜딩이 넘기는 값 그대로 — `app/page.tsx`. */
const shell = () => render(h(PublicShell, { m: en, account: GUEST, children: h("p", null, "landing body") }));

describe("공개 셸 — 구조", () => {
  it("본문 랜드마크가 하나이고 페이지 내용은 스크롤러 안에 선다", async () => {
    const { container } = await shell();
    expect(container.querySelectorAll("main")).toHaveLength(1);
    const scroller = container.querySelector("main > div");
    expect(scroller?.textContent).toBe("landing body");
    // 스테이지·목차가 `closest("[data-public-scroller]")`로 이 요소를 스크롤 대상으로 찾는다.
    expect(container.querySelectorAll("[data-public-scroller]")).toHaveLength(1);
    expect(scroller?.hasAttribute("data-public-scroller")).toBe(true);
  });

  it("마운트 뒤 포커스가 스크롤러에 있다", async () => {
    const { container } = await shell();
    const scroller = container.querySelector("main > div");
    expect(scroller).not.toBeNull();
    expect(document.activeElement).toBe(scroller);
    expect(scroller?.getAttribute("tabindex")).toBe("-1");
  });

  /** ⚠️ `preventScroll`이 빠지면 포커스가 스크롤 위치를 건드린다 — activeElement만으로는 안 보인다. */
  it("마운트 때 `preventScroll`로 포커스한다", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      const { container } = await shell();
      const scroller = container.querySelector("main > div");
      const calls = focus.mock.contexts.flatMap((self, index) => (self === scroller ? [focus.mock.calls[index]] : []));
      expect(calls).toEqual([[{ preventScroll: true }]]);
    } finally {
      focus.mockRestore();
    }
  });

  /** `/docs/x#workflow`로 들어오면 대상 h2가 포커스를 받는다 — 스크롤러가 가져가면 Tab이 문서 첫머리에서 다시 시작한다(DESIGN §6.61). */
  it("해시가 `tabIndex`를 든 요소를 가리키면 그 요소가 포커스를 받는다", async () => {
    history.replaceState(null, "", "#workflow");
    try {
      await render(h(PublicShell, { m: en, account: GUEST, children: h("h2", { id: "workflow", tabIndex: -1 }, "Workflow") }));
      expect(document.activeElement?.id).toBe("workflow");
    } finally {
      history.replaceState(null, "", window.location.pathname);
    }
  });

  it("해시 대상이 포커스를 못 받는 요소거나 깨진 인코딩이면 스크롤러가 받는다", async () => {
    for (const hash of ["#plain", "#%E0"]) {
      history.replaceState(null, "", hash);
      try {
        const { container } = await render(h(PublicShell, { m: en, account: GUEST, children: h("p", { id: "plain" }, "body") }));
        expect(document.activeElement).toBe(container.querySelector("[data-public-scroller]"));
      } finally {
        history.replaceState(null, "", window.location.pathname);
      }
    }
  });

  /** `/docs`는 레이아웃이 셸을 들고 본문 스크롤러는 페이지가 든다(DESIGN §6.61) — 셸이 스크롤러를 하나 더 만들면 중첩된다. */
  it("`bare`면 패널 안을 스크롤러로 감싸지 않는다", async () => {
    const { container } = await render(h(PublicShell, { m: en, account: GUEST, current: "docs", bare: true, children: h("p", null, "body") }));
    expect(container.querySelectorAll("[data-public-scroller]")).toHaveLength(0);
    expect(container.querySelector("main > p")?.textContent).toBe("body");
  });

  /**
   * 헤더·푸터의 빈 곳을 누르면 포커스가 `body`로 빠지고, 그 뒤 Space/PageDown이 아무것도 안 민다(POSTMORTEM 2026-09-24
   * "포커스가 body로 빠지는 자리"). jsdom에는 클릭의 포커스 이동이 없어 `blur()`로 같은 상태를 만든다.
   */
  it("포커스가 body로 빠지면 스크롤러가 되찾는다 — 다른 요소로 옮긴 포커스는 건드리지 않는다", async () => {
    const { container } = await shell();
    const scroller = container.querySelector<HTMLElement>("main > div");
    const link = container.querySelector<HTMLAnchorElement>("header nav a");
    expect(scroller && link).toBeTruthy();
    const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    await act(async () => { link?.focus(); });
    await settle();
    expect(document.activeElement).toBe(link);

    await act(async () => { link?.blur(); });
    await settle();
    expect(document.activeElement).toBe(scroller);
  });

  it("body를 캔버스 색으로 칠한다 — 오버스크롤 때 흰 띠가 안 보인다", async () => {
    const { container } = await shell();
    const styles = [...container.querySelectorAll("style")].map((node) => node.textContent);
    expect(styles).toContain("body{background-color:var(--canvas)}");
  });
});

describe("공개 셸 — 헤더", () => {
  it("HeaderBar를 쓰고 로고·내비는 start, 가운데는 검색 캡슐이다", async () => {
    const { container } = await shell();
    const bar = container.querySelector("header");
    expect(bar).not.toBeNull();
    expect(bar?.classList.contains("grid-cols-[1fr_auto_1fr]")).toBe(true);
    expect(bar?.classList.contains("mb-1.5")).toBe(true);
    // 헤더 44(2026-10-04): 위 6 + 헤더 44 + 아래 6 = 패널 시작 56 — 바깥 `pt-1.5`와 헤더 `mb-1.5`, 헤더 `h-11`.
    expect(bar?.classList.contains("h-11")).toBe(true);
    // 바깥 셸 div(`main`의 부모)가 `pt-1.5`를 든다 — 아무 자손이 아니다. 산술은 `header-44.test.tsx`.
    expect(container.querySelector("main")?.parentElement?.classList.contains("pt-1.5")).toBe(true);
    expect(bar?.children).toHaveLength(3);
    const start = bar!.children[0]!;
    expect(start.className).toBe("justify-self-start");
    expect(start.querySelectorAll("nav")).toHaveLength(1);
    expect(start.querySelector(`a[aria-label="${en.landing.shell.logo}"]`)).not.toBeNull();
    expect(start.firstElementChild?.className.split(/\s+/)).toEqual(expect.arrayContaining(["flex", "items-center", "gap-5"]));
    expect(bar?.children[1]?.className).toBe("justify-self-center");
    expect(bar!.children[1]!.querySelector('button[aria-label="Search"]')).not.toBeNull();
    expect(bar?.children[2]?.className).toBe("justify-self-end");
  });
  it("로고가 Home으로 가고 이름을 갖는다", async () => {
    const { container } = await shell();
    const logo = container.querySelector(`header a[aria-label="${en.landing.shell.logo}"]`);
    expect(en.landing.shell.logo).toBe("Malmoi home");
    expect(logo?.getAttribute("href")).toBe(routes.home());
  });

  /** 헤더 내비는 앱 안 목적지만 든다 — GitHub는 내비 밖 우측 끝이다(2026-09-28 사용자). 랜딩은 current가 없다(`Home`이 빠졌다). */
  it("Main 내비가 Docs · Changelog 순이고 랜딩에선 어느 것도 aria-current가 아니다", async () => {
    const { container } = await shell();
    const nav = container.querySelector(`nav[aria-label="${en.landing.shell.nav}"]`);
    expect(en.landing.shell.nav).toBe("Main");
    const links = [...(nav?.querySelectorAll("a") ?? [])];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      [en.landing.shell.docs, routes.docs()],
      [en.changelog.title, routes.changelog()],
    ]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, null]);
    expect(links.map((a) => a.getAttribute("target"))).toEqual([null, null]);
  });

  it("CTA는 Get started 하나이고 로그인으로 간다", async () => {
    const { container } = await shell();
    const cta = [...container.querySelectorAll("header a")].filter((a) => a.textContent === en.landing.shell.getStarted);
    expect(en.landing.shell.getStarted).toBe("Get started");
    expect(cta).toHaveLength(1);
    expect(cta[0]?.getAttribute("href")).toBe(routes.signIn());
  });

  it("`/docs/*`는 Docs만 aria-current다", async () => {
    const { container } = await render(h(PublicShell, { m: en, account: GUEST, current: "docs", children: h("p", null, "body") }));
    const links = [...container.querySelectorAll(`nav[aria-label="${en.landing.shell.nav}"] a`)];
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual(["page", null]);
  });

  it("`/changelog`는 Changelog만 aria-current다", async () => {
    const { container } = await render(h(PublicShell, { m: en, account: GUEST, current: "changelog", children: h("p", null, "body") }));
    const links = [...container.querySelectorAll(`nav[aria-label="${en.landing.shell.nav}"] a`)];
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page"]);
  });

  /** `/privacy`는 헤더 링크 어디에도 없는 화면이다 — current를 안 넘기면 어느 링크도 current가 아니다. */
  it("`current`가 없으면 헤더에 `aria-current`가 없다", async () => {
    const { container } = await render(h(PublicShell, { m: en, account: GUEST, children: h("p", null, "body") }));
    expect(container.querySelectorAll("header [aria-current]")).toHaveLength(0);
  });

  /** 2026-09-28 사용자 — 로고가 곧 홈이라 `Home`을 뺐다. 내비는 `Docs · Changelog` 둘이고 글자만이다. */
  it("내비는 Docs · Changelog 둘이고 아이콘이 없다", async () => {
    const { container } = await shell();
    const links = [...container.querySelectorAll(`nav[aria-label="${en.landing.shell.nav}"] a`)];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      [en.landing.shell.docs, routes.docs()],
      [en.changelog.title, routes.changelog()],
    ]);
    expect(container.querySelectorAll(`nav[aria-label="${en.landing.shell.nav}"] svg`)).toHaveLength(0);
  });

  it("비로그인 primary는 `LogIn` 아이콘을 든 Get started다", async () => {
    const { container } = await shell();
    const first = container.querySelector(`header a[href="${routes.signIn()}"]`)?.firstElementChild;
    expect(first?.tagName.toLowerCase()).toBe("svg");
    expect(first?.getAttribute("aria-hidden")).toBe("true");
    expect(first?.getAttribute("class")).toContain("lucide-log-in");
  });

  /** 2026-09-28 사용자 — `Open Malmoi` 대신 앱 셸과 같은 아바타 메뉴로 들어간다. */
  it("로그인이면 Get started 없이 앱 셸과 같은 사용자 메뉴가 선다", async () => {
    const { container } = await render(h(PublicShell, { m: en, account: SIGNED_IN, children: h("p", null, "body") }));
    expect([...container.querySelectorAll("header a")].filter((a) => a.getAttribute("href") === routes.signIn())).toHaveLength(0);
    expect(container.querySelector(`header button[aria-label="${en.common.nav.userMenu}"]`)).not.toBeNull();
    expect(container.querySelector("header")?.textContent).not.toContain("Open Malmoi");
  });

  /** user-menu-projects 완료 조건 7 — 공개 셸은 페이지 렌더에 멤버십 조회를 싣지 않고, 메뉴도 열기 직전까지 부르지 않는다. */
  it("로그인한 공개 셸이 렌더·마운트만으로는 멤버십 Action을 부르지 않는다", async () => {
    search.memberships.mockClear();
    const { container } = await render(h(PublicShell, { m: en, account: SIGNED_IN, children: h("p", null, "body") }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.querySelector(`header button[aria-label="${en.common.nav.userMenu}"]`)).not.toBeNull();
    expect(search.memberships).not.toHaveBeenCalled();
  });

  /** 리뷰 🟢5 — 헤더가 실수로 멤버십을 넘기기 시작하면(→ 0회) 또는 Inbox Action을 같이 부르면 여기서 red다. */
  it("로그인한 공개 셸에서 아바타 메뉴를 열면 멤버십 Action은 정확히 1회, Inbox 열기 Action은 0회다", async () => {
    search.memberships.mockClear();
    inbox.open.mockClear();
    const { container } = await render(h(PublicShell, { m: en, account: SIGNED_IN, children: h("p", null, "body") }));
    const trigger = container.querySelector<HTMLButtonElement>(`header button[aria-label="${en.common.nav.userMenu}"]`)!;
    await act(async () => userEvent.setup().click(trigger));
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(search.memberships).toHaveBeenCalledTimes(1);
    expect(inbox.open).not.toHaveBeenCalled();
  });

  /**
   * primary와 GitHub 사이에 연한 세로 구분선 하나 — 장식이라 접근성 트리에 안 선다. 로그인이면 앱 셸 헤더처럼
   * 세로선 오른쪽·아바타 왼쪽에 Inbox가 선다(2026-10-05 사용자 — attention-inbox 범위 변경).
   */
  it("우측은 GitHub · 구분선 · primary 순서다 — 로그인이면 primary 앞에 Inbox", async () => {
    for (const account of [GUEST, SIGNED_IN]) {
      const { container } = await render(h(PublicShell, { m: en, account, children: h("p", null, "body") }));
      const right = container.querySelector("header > .justify-self-end > div");
      const kids = [...(right?.children ?? [])];
      expect(kids).toHaveLength(account === null ? 3 : 4);
      expect(kids[1]?.getAttribute("aria-hidden")).toBe("true");
      expect(kids[1]?.className).toContain("bg-border-subtle");
      expect(kids[0]?.getAttribute("href")).toBe(GITHUB_REPO_URL);
      if (account !== null) {
        expect(kids[2]?.getAttribute("aria-haspopup")).toBe("menu");
        expect(kids[2]?.getAttribute("aria-label")).toBe(en.inbox.label);
        expect(kids[3]?.getAttribute("aria-label")).toBe(en.common.nav.userMenu);
      }
    }
  });

  /**
   * 버튼이 아니라 좌측 내비 항목 모양이다 — 보더 없이 hover 때만 면이 선다(앱 사이드바 `Item`과 같은 캔버스 급 3%, DESIGN §5).
   * 철자는 `visual-system.test.ts`가 전역으로 센다(5-Y8) — 헤더 `Docs`·`Changelog`의 옛 `/3`도 거기서 잡혔다.
   */
  it("GitHub는 아이콘 + GitHub 글자이고 사이드바 항목 모양이다", async () => {
    const { container } = await shell();
    const github = container.querySelector(`header a[href="${GITHUB_REPO_URL}"]`);
    expect(github?.textContent).toBe(en.landing.shell.github);
    expect(github?.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    const classes = github?.className.split(/\s+/) ?? [];
    expect(classes).toEqual(expect.arrayContaining(["rounded-sm", "p-1.5", "text-sm", "hover:bg-foreground/[0.03]"]));
    expect(classes.some((c) => c === "border" || c.startsWith("border-"))).toBe(false);
  });
});

/**
 * ⚠️ **외부 링크를 그리는 자리가 셋이다**(공개 셸 헤더 · 푸터 · `/signin` — 헤더의 GitHub는 2026-09-28에 우측 primary 왼쪽으로 돌아왔다) — 목록 동등성
 * 검사는 href만 보므로 한쪽이 `rel`·`target`을 잃어도 못 잡는다. 셋을 따로 센다(`/signin`은 2026-09-26부터 같은 `PublicFooter`를 그린다).
 */
describe("GitHub 링크 — 새 탭 + `noreferrer`", () => {
  const external = (links: Element[]) => {
    const github = links.filter((a) => a.getAttribute("href") === GITHUB_REPO_URL);
    expect(github).toHaveLength(1);
    expect(github[0]?.getAttribute("target")).toBe("_blank");
    expect(github[0]?.getAttribute("rel")?.split(/\s+/)).toContain("noreferrer");
  };

  it("랜딩 헤더", async () => {
    const { container } = await shell();
    external([...container.querySelectorAll("header a")]);
  });

  it("랜딩 푸터", async () => {
    const { container } = await shell();
    external([...container.querySelectorAll("footer a")]);
  });

  it("`/signin` 푸터", () => {
    const signin = document.createElement("div");
    signin.innerHTML = renderToStaticMarkup(h(AuthLayout, { m: en, children: null }));
    external([...signin.querySelectorAll("footer a")]);
  });
});

describe("푸터 — `/signin`·초대·계정 병합도 공개 셸 푸터 하나다", () => {
  const signin = () => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(h(AuthLayout, { m: en, children: h("p", null, "form") }));
    return root;
  };

  /** 옛 형은 좌측 패널 안의 `absolute` 푸터였다 — 이제 두 패널 아래 전폭 한 줄이다(2026-09-26 사용자). */
  it("`<footer>`가 정확히 하나이고 `<main>` 밖이다", () => {
    const root = signin();
    const footers = root.querySelectorAll("footer");
    expect(footers).toHaveLength(1);
    expect(footers[0]?.closest("main")).toBeNull();
    expect(root.querySelectorAll("main")).toHaveLength(1);
  });

  it("마크업이 `PublicFooter`와 바이트 단위로 같다", () => {
    // 언어 스위처의 Radix 트리거 id는 렌더마다 `useId`가 새로 짓는다 — 그 한 값만 지우고 나머지 바이트를 견준다.
    const unId = (html: string | undefined) => html?.replace(/ id="radix-[^"]*"/g, "");
    const own = renderToStaticMarkup(h(PublicFooter, { m: en }));
    expect(own).toContain('id="radix-');
    expect(unId(signin().querySelector("footer")?.outerHTML)).toBe(unId(own));
  });

  it("바깥 `px-2 pt-2`(헤더가 없어 위 8 — 공개 셸의 6+44+6과 다르다), 푸터가 바닥 40을 든다", () => {
    const outer = signin().querySelector("footer")?.parentElement;
    expect(outer?.className.split(/\s+/)).toEqual(expect.arrayContaining(["flex", "flex-col", "min-h-svh", "min-w-shell-min", "px-2", "pt-2"]));
    expect(outer?.className.split(/\s+/)).not.toContain("p-2");
    expect(outer?.lastElementChild?.tagName).toBe("FOOTER");
  });
});

describe("푸터 링크 — `/signin`과 한 목록", () => {
  const pairs = (root: ParentNode) =>
    [...root.querySelectorAll("footer a")].map((a) => [a.textContent, a.getAttribute("href")]);

  it("GitHub · Privacy Policy 둘이다 — Docs·Changelog는 헤더가 든다", () => {
    expect(footerLinks(en).map(({ label, href, external }) => [label, href, external])).toEqual([
      [en.signIn.footer.github, GITHUB_REPO_URL, true],
      [en.signIn.footer.privacy, routes.privacy(), false],
    ]);
  });

  it("랜딩 푸터와 로그인 푸터가 같은 링크를 같은 순서로 낸다", async () => {
    const { container } = await shell();
    const signin = document.createElement("div");
    signin.innerHTML = renderToStaticMarkup(h(AuthLayout, { m: en, children: null }));
    expect(pairs(container)).toEqual(pairs(signin));
    expect(pairs(container)).toEqual(footerLinks(en).map(({ label, href }) => [label, href]));
  });
});

describe("공개 셸 — 소스 계약", () => {
  const DIR = join(process.cwd(), "components/public-shell");
  const files = readdirSync(DIR).filter((name) => name.endsWith(".tsx"));
  const read = (name: string) => readFileSync(join(DIR, name), "utf8");
  const all = files.map(read).join("\n");

  it("소스를 실제로 읽었다", () => {
    expect(all.length).toBeGreaterThan(200);
  });

  it("루트가 뷰포트 높이를 채우고 문서는 스크롤되지 않는다", () => {
    expect(all).toMatch(/className="[^"]*\bh-svh\b[^"]*"/);
    expect(all).toContain("min-w-shell-min");
    expect(all).toMatch(/className="[^"]*\bh-svh\b[^"]*\boverflow-hidden\b|className="[^"]*\boverflow-hidden\b[^"]*\bh-svh\b/);
  });

  it("스크롤러가 세로로만 흐른다", () => {
    expect(all).toContain("overflow-y-auto");
    expect(all).toContain("overflow-x-hidden");
  });

  /**
   * ⚠️ **클라이언트 잎은 스크롤러 하나이고 `lib/`를 읽지 않는다** — 읽으면 `client-graph.test.ts`의
   * `CLIENT_LIB_FILES`가 늘어야 한다(그 파일은 이 배치 밖이다).
   */
  it("`\"use client\"`는 스크롤러 하나이고 그 파일은 `lib/`를 import하지 않는다", () => {
    const clients = files.filter((name) => /^["']use client["']/.test(read(name)));
    expect(clients).toEqual(["scroller.tsx"]);
    expect(read("scroller.tsx")).not.toMatch(/from\s+["']@\/lib\//);
  });
});

/**
 * **공개 셸 헤더의 Inbox** (2026-10-05 사용자 — attention-inbox 범위 변경). 앱 셸과 같은 `AttentionInbox` 하나이고 로그인(`publicAccount`가
 * 값)일 때만 선다. ⚠️ 헤더는 세션을 직접 읽지 않는다 — 페이지가 넘긴 `account`로만 가르고, 데이터는 Inbox가 자기 Action으로 읽는다.
 */
describe("공개 셸 — 헤더 Inbox", () => {
  beforeEach(() => {
    inbox.badge.mockReset().mockResolvedValue({ status: "ok", unread: 2 });
    inbox.open.mockReset().mockResolvedValue({ status: "ok", plan: { groups: [], unread: 0 }, loadedAt: new Date("2026-10-05T00:00:00Z"), marked: true });
  });

  it("비로그인(none · unavailable)이면 Inbox가 없고 배지 Action을 부르지 않는다", async () => {
    for (const session of [{ status: "none" }, { status: "unavailable" }] as const) {
      const { container } = await render(h(PublicShell, { m: en, account: publicAccount(session), children: h("p", null, "body") }));
      await act(async () => {});
      expect(container.querySelector('header button[aria-haspopup="menu"]')).toBeNull();
    }
    expect(inbox.badge).not.toHaveBeenCalled();
    expect(inbox.open).not.toHaveBeenCalled();
  });

  it("로그인이면 배지를 한 번 읽어 수를 보이고, 열면 메뉴가 서고 닫아도 셸이 산다", async () => {
    const { container } = await render(h(PublicShell, { m: en, account: SIGNED_IN, children: h("p", null, "body") }));
    await act(async () => {});
    expect(inbox.badge).toHaveBeenCalledTimes(1);
    const trigger = container.querySelector<HTMLButtonElement>(`header button[aria-label="${en.inbox.labelUnread(2)}"]`)!;
    expect(trigger).not.toBeNull();
    expect(trigger.querySelector("[data-inbox-badge]")?.textContent).toBe("2");
    await act(async () => { await userEvent.setup().click(trigger); });
    expect(inbox.open).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.isConnected).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(container.querySelector("header")).not.toBeNull();
  });
});

// 안 읽음 수는 모듈 store라 파일 안 테스트 사이로 샌다(inbox-page D2) — 헤더·사이드바를 그리는 파일은 매번 되돌린다.
afterEach(() => { setUnread(0); });
