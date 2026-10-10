// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { DOC_TABLE } from "@/components/public-doc-table";
import { PAGE_TITLE, SECTION_HEADING } from "@/components/docs/classes";
import { routes } from "@/lib/routes";
import { WIDE_QUERY } from "@/lib/shell/breakpoint";
import { en } from "@/messages/en";

/**
 * **`/docs/*`의 좁은 폭** (responsive-public P3 · PT2a·PT2b·PT2c · D1·D3·D7·D14).
 *
 * jsdom은 폭·컨테이너 쿼리를 못 잰다 — 무엇이 어느 폭에 서는지는 `lg:`·`max-lg:`·`@[960px]/reading:` 클래스로 들고, 폭이 바뀌는 순간은
 * `matchMedia` 스텁의 `change`로 만든다. 959/960/961 computed grid는 런타임 실측(b)의 몫이다.
 * ⚠️ 포커스 단언은 focus fixup observer를 단다(POSTMORTEM 2026-09-20 — jsdom은 꺼진 요소의 포커스를 안 치운다).
 */
vi.setConfig({ testTimeout: 20_000 });

const mocks = vi.hoisted(() => ({ path: "/docs" }));

vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "none" }) }));
vi.mock("@/lib/i18n/server", async () => ({
  getUiLocale: async () => "en",
  getMessages: async () => (await import("@/messages/en")).en,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.path,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/app/search/actions", () => ({ searchKeysAction: vi.fn(), loadSearchMembershipsAction: vi.fn() }));
vi.mock("@/app/ui-locale/actions", () => ({ setUiLocale: vi.fn() }));
vi.mock("@/app/color-scheme/actions", () => ({ setColorScheme: vi.fn() }));

type Listener = (event: { matches: boolean }) => void;
let listeners: Set<Listener>;
let wide = false;
let fixup: MutationObserver;
let blockNavigation: (event: MouseEvent) => void;

beforeEach(() => {
  listeners = new Set();
  wide = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() { return query === WIDE_QUERY ? wide : false; },
    addEventListener: (type: string, listener: Listener) => { if (query === WIDE_QUERY && type === "change") listeners.add(listener); },
    removeEventListener: (type: string, listener: Listener) => { if (type === "change") listeners.delete(listener); },
  }));
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
  history.replaceState(null, "", "/");
});

async function page(slug: string[]) {
  mocks.path = routes.docs(slug.join("/") || undefined);
  const { default: Docs } = await import("@/app/docs/[[...slug]]/page");
  const { default: Layout } = await import("@/app/docs/layout");
  return render(await Layout({ children: await Docs({ params: Promise.resolve({ slug }) }) }));
}

async function notFoundPage() {
  mocks.path = "/docs/nope";
  const { default: NotFound } = await import("@/app/docs/not-found");
  const { default: Layout } = await import("@/app/docs/layout");
  return render(await Layout({ children: NotFound() }));
}

/** 캡슐 = `main` 안의 dialog 트리거 버튼. 접근 이름은 aria-label이 아니라 내용(sr 접두 `Docs: ` + 보이는 제목)이다(WCAG 2.5.3). */
const capsule = () => document.querySelector<HTMLButtonElement>('main button[aria-haspopup="dialog"]')!;
/** 보이는 라벨 — sr 접두를 뺀 제목. */
const visible = () => capsule().querySelector(":scope > span:not(.sr-only)")?.textContent;
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
const sheetLinks = () => [...(sheet()?.querySelectorAll<HTMLAnchorElement>(`nav[aria-label="${en.publicDocs.docs.nav}"] a`) ?? [])];
const click = async (node: Element) => { await act(async () => { await userEvent.setup().click(node); }); };
/** Radix FocusScope는 닫힘 자동 포커스를 `setTimeout(0)` 뒤에 쏜다 — 한 틱을 넘긴다. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe("Docs 내비 — 넓은 폭은 고정 264, 좁은 폭은 하단 캡슐 (PT2a · D1)", () => {
  it("고정 내비는 `lg` 이상에만, 캡슐은 `lg` 미만에만 선다", async () => {
    await page(["setup", "workflow"]);
    const fixed = document.querySelector(`main > nav[aria-label="${en.publicDocs.docs.nav}"]`);
    expect(fixed?.classList.contains("max-lg:hidden")).toBe(true);
    expect(capsule().closest(".lg\\:hidden")).not.toBeNull();
  });

  it("캡슐 — 접근 이름 Docs · dialog를 연다 · 라벨은 현재 페이지 제목", async () => {
    await page(["setup", "workflow"]);
    const button = capsule();
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.hasAttribute("aria-label")).toBe(false);
    // 접근 이름이 보이는 라벨을 담는다 — 음성 제어 "Add the workflow 누르기"가 먹고 스크린리더가 지금 페이지를 듣는다.
    expect(button.textContent).toBe(`${en.publicDocs.docs.nav}: Add the workflow`);
    expect(button.querySelector(".sr-only")?.textContent).toBe(`${en.publicDocs.docs.nav}: `);
    expect(visible()).toBe("Add the workflow");
  });

  it("개요의 캡슐 라벨은 개요의 SUMMARY 제목이다", async () => {
    await page([]);
    expect(visible()).toBe("Malmoi");
  });

  it("404는 현재 페이지가 없어 라벨이 Docs 제목이다 (D7)", async () => {
    await notFoundPage();
    expect(visible()).toBe(en.publicDocs.docs.title);
  });

  it("캡슐 형 — 44 · radius full · 연한 윤곽 · 바탕 면 · shadow-medium · 푸터 위 16 가운데", async () => {
    await page(["setup", "workflow"]);
    const classes = [...capsule().classList];
    expect(classes).toEqual(expect.arrayContaining(["h-11", "rounded-full", "border", "border-border-subtle", "bg-background", "shadow-medium", "font-medium"]));
    expect(classes).not.toContain("shadow-low");
    expect(classes).not.toContain("w-80");
    const dock = capsule().parentElement!;
    expect([...dock.classList]).toEqual(expect.arrayContaining(["absolute", "inset-x-0", "bottom-4", "justify-center", "pointer-events-none"]));
  });
});

describe("Docs 내비 시트 — 캡슐이 여는 전체 화면 (PT2c · D14)", () => {
  it("열면 머리 제목 Docs의 시트가 서고 같은 SUMMARY 트리가 행 최소 40으로 선다", async () => {
    await page(["setup", "workflow"]);
    await click(capsule());
    const dialog = sheet();
    expect(dialog).not.toBeNull();
    expect(capsule().getAttribute("aria-expanded")).toBe("true");
    expect(dialog?.querySelector("h2")?.textContent).toBe(en.publicDocs.docs.nav);
    const fixed = [...document.querySelectorAll<HTMLAnchorElement>(`main > nav[aria-label="${en.publicDocs.docs.nav}"] a`)].map((a) => a.getAttribute("href"));
    expect(sheetLinks().map((a) => a.getAttribute("href"))).toEqual(fixed);
    expect(sheetLinks().length).toBeGreaterThan(10);
    // 행 최소 40은 시트 내비가 든다(DocsNavLink 형은 그대로).
    expect(dialog?.querySelector("nav")?.className).toContain("[&_a]:min-h-10");
  });

  it("열면 포커스가 현재 페이지 행에 선다", async () => {
    await page(["setup", "workflow"]);
    await click(capsule());
    const current = sheetLinks().find((a) => a.getAttribute("aria-current") === "page");
    expect(current?.getAttribute("href")).toBe(routes.docs("setup/workflow"));
    expect(document.activeElement).toBe(current);
  });

  it("404(현재 행 없음)에서 열면 첫 항목에 포커스가 선다", async () => {
    await notFoundPage();
    await click(capsule());
    expect(sheetLinks()[0]).toBeDefined();
    expect(document.activeElement).toBe(sheetLinks()[0]);
  });

  it("Esc로 닫으면 캡슐로 돌아온다", async () => {
    await page(["setup", "workflow"]);
    await click(capsule());
    await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
    await settle();
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(capsule());
  });

  it("닫기 버튼도 캡슐로 돌아온다", async () => {
    await page(["setup", "workflow"]);
    await click(capsule());
    await click(sheet()!.querySelector(`button[aria-label="${en.common.close}"]`)!);
    await settle();
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(capsule());
  });

  it("다른 페이지 링크로 닫히면 캡슐로 돌려주지 않는다 — 도착한 페이지의 스크롤러가 포커스를 가진다", async () => {
    await page(["setup", "workflow"]);
    await click(capsule());
    await click(sheetLinks().find((a) => a.getAttribute("href") === routes.docs("translate"))!);
    await settle();
    expect(sheet()).toBeNull();
    expect(document.activeElement).not.toBe(capsule());
  });

  it("열린 채 `lg`를 넘으면 닫는다 — 리스너는 열린 동안만이다", async () => {
    await page(["setup", "workflow"]);
    expect(listeners.size).toBe(0);
    await click(capsule());
    expect(listeners.size).toBe(1);
    const [sheetListener] = [...listeners];
    wide = true;
    await act(async () => { for (const listener of [...listeners]) listener({ matches: true }); });
    await settle();
    expect(sheet()).toBeNull();
    // 시트의 리스너는 걷혔다 — 남은 하나는 포커스를 받은 고정 내비의 것이다(포커스가 안에 있는 동안만).
    expect(listeners.has(sheetListener!)).toBe(false);
    // 캡슐은 그때 `lg:hidden`이다 — 고정 내비의 현재 행이 받는다.
    expect(document.activeElement).toBe(document.querySelector(`[data-docs-nav] a[aria-current="page"]`));
  });

  it("지금 페이지 행을 누르면 이동이 없으니 캡슐로 돌아온다", async () => {
    await page(["setup", "workflow"]);
    await click(capsule());
    await click(sheetLinks().find((a) => a.getAttribute("aria-current") === "page")!);
    await settle();
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(capsule());
  });
});

describe("목차 — 컨테이너 960 미만은 본문 앞 disclosure (PT2b)", () => {
  it("목차 인스턴스는 하나이고 disclosure 버튼이 그 안에 있다 — 기본 접힘", async () => {
    await page(["setup", "workflow"]);
    const tocs = document.querySelectorAll(`nav[aria-labelledby]`);
    expect(tocs).toHaveLength(1);
    const toggle = tocs[0]!.querySelector<HTMLButtonElement>("button[aria-expanded]");
    expect(toggle?.textContent).toBe(en.publicDocs.docs.toc);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.classList.contains("@[960px]/reading:hidden")).toBe(true);
  });

  it("목차는 DOM에서 본문 앞이다 — 좁은 폭에서 보이는 순서와 Tab 순서가 같다", async () => {
    await page(["setup", "workflow"]);
    const toc = document.querySelector(`nav[aria-labelledby]`)!;
    const article = document.querySelector("article")!;
    expect(toc.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("목차가 없는 페이지(장 개요·개요·404)는 disclosure가 없다", async () => {
    await page(["translate"]);
    expect(document.querySelector("button[aria-expanded][aria-controls]")).toBeNull();
    await page([]);
    expect(document.querySelector(`nav[aria-labelledby]`)).toBeNull();
  });
});

describe("DocFrame — 컨테이너 판정 · 표시급 · 긴 표/URL (PT2a · D3)", () => {
  it("컨테이너 선언은 부모, 질의는 자식 grid다 — 960 이상만 두 열 · 640 미만 좌우 20", async () => {
    await page(["setup", "workflow"]);
    const article = document.querySelector("article")!;
    const grid = article.parentElement!;
    const outer = grid.parentElement!;
    expect(outer.classList.contains("@container/reading")).toBe(true);
    expect([...grid.classList]).toEqual(expect.arrayContaining([
      "mx-auto", "max-w-[1064px]", "grid", "grid-cols-1", "@[960px]/reading:grid-cols-[minmax(0,720px)_200px]",
      "px-5", "@[640px]/reading:px-10", "pb-30",
    ]));
    expect(grid.classList.contains("@container/reading")).toBe(false);
  });

  it("`lg` 미만 위 여백 40 · h1 30 · 절 제목 20", async () => {
    await page(["setup", "workflow"]);
    const grid = document.querySelector("article")!.parentElement!;
    expect([...grid.classList]).toEqual(expect.arrayContaining(["pt-16", "max-lg:pt-10"]));
    expect(document.querySelector("article h1")?.className).toBe(PAGE_TITLE);
    expect(PAGE_TITLE.split(" ")).toEqual(expect.arrayContaining(["text-4xl", "max-lg:text-3xl"]));
    expect(SECTION_HEADING.split(" ")).toEqual(expect.arrayContaining(["text-2xl", "max-lg:text-xl"]));
  });

  it("본문은 긴 URL을 줄바꿈하고 표 안은 되돌린다 · 표는 자기 안에서만 가로 스크롤(최소 640)", async () => {
    await page(["setup", "workflow"]);
    expect(document.querySelector("article")?.classList.contains("wrap-anywhere")).toBe(true);
    expect(DOC_TABLE.split(" ")).toEqual(expect.arrayContaining(["overflow-x-auto", "[&_table]:min-w-160", "[&_table]:wrap-normal"]));
  });

  it("이전/다음은 좁아도 두 칸이다", async () => {
    await page(["setup", "workflow"]);
    const neighbours = document.querySelector(`nav[aria-label="${en.publicDocs.docs.pages}"]`);
    expect(neighbours?.classList.contains("grid-cols-2")).toBe(true);
  });

  it("페이지가 바뀌면 본문 스크롤러가 새로 마운트된다(§6.615)", async () => {
    const first = await page(["setup", "workflow"]);
    const before = first.container.querySelector("[data-public-scroller]");
    mocks.path = routes.docs("translate");
    const { default: Docs } = await import("@/app/docs/[[...slug]]/page");
    const { default: Layout } = await import("@/app/docs/layout");
    await first.rerender(await Layout({ children: await Docs({ params: Promise.resolve({ slug: ["translate"] }) }) }));
    const after = first.container.querySelector("[data-public-scroller]");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });
});

/** design §2 — 좁아지며 고정 내비가 숨을 때 그 안에 포커스가 있었으면 장 내비의 트리거(캡슐)로 옮긴다(POSTMORTEM 2026-09-24). */
describe("고정 내비 → 좁아짐", () => {
  const fixedLinks = () => [...document.querySelectorAll<HTMLAnchorElement>("[data-docs-nav] a")];

  it("포커스가 고정 내비 안에 있으면 캡슐로 옮긴다 — 리스너는 포커스가 안에 있는 동안만이다", async () => {
    wide = true;
    await page(["setup", "workflow"]);
    expect(listeners.size).toBe(0);
    await act(async () => { fixedLinks()[2]!.focus(); });
    expect(listeners.size).toBe(1);
    wide = false;
    await act(async () => { for (const listener of [...listeners]) listener({ matches: false }); });
    expect(document.activeElement).toBe(capsule());
    expect(listeners.size).toBe(0);
  });

  it("포커스가 밖에 있으면 건드리지 않고 리스너도 없다", async () => {
    wide = true;
    await page(["setup", "workflow"]);
    await act(async () => { fixedLinks()[0]!.focus(); });
    const outside = document.querySelector<HTMLElement>("[data-public-scroller]")!;
    await act(async () => { outside.focus(); });
    expect(listeners.size).toBe(0);
  });
});
