// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { GithubIcon } from "@/components/signin/brand-icons";
import type { SessionRead } from "@/lib/auth/read-session";
import { en } from "@/messages/en";
import { GITHUB_REPO_URL } from "@/lib/links";
import { routes } from "@/lib/routes";
import { navFooterItems } from "@/lib/shell/nav";

vi.mock("@/lib/i18n/server", async () => ({ getMessages: async () => (await import("@/messages/en")).en, getUiLocale: async () => "en" }));

/**
 * **루트(`/`)의 세 갈래** (ARCHITECTURE `rootView` 문단 · DESIGN §6.615) — `ok`는 여전히 `/projects`(2026-09-10 결정), `none`·`unavailable`은 랜딩이다.
 *
 * ⚠️ `unavailable`도 랜딩이다(옛: `/signin?error=Unavailable`) — 공개 화면이 세션 장애로 안 열리는 것이 더 나쁘다.
 * 장애 신호는 보호 라우트의 `rejectTarget`이 계속 든다(`lib/auth/__tests__/landing.test.ts`).
 */
const mocks = vi.hoisted(() => ({
  status: "none" as SessionRead["status"],
  redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); }),
}));

vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: mocks.status }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

beforeEach(() => {
  mocks.redirect.mockClear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function page(status: SessionRead["status"]) {
  mocks.status = status;
  const { default: Root } = await import("@/app/page");
  return Root();
}

describe("`/` — 세션이 있으면 여전히 프로젝트 목록이다", () => {
  it("`ok` → `/projects`로 redirect하고 랜딩을 그리지 않는다", async () => {
    await expect(page("ok")).rejects.toThrow(`NEXT_REDIRECT ${routes.projects()}`);
    expect(mocks.redirect).toHaveBeenCalledWith(routes.projects());
  });
});

describe.each(["none", "unavailable"] as const)("`/` — `%s`는 랜딩이다", (status) => {
  it("본문 랜드마크 하나 · 히어로 h1 · 섹션 이름 · CTA가 `/signin`", async () => {
    const { container } = await render(await page(status));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(container.querySelectorAll("main")).toHaveLength(1);

    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toBe(en.landing.hero.title.join(""));
    expect(container.querySelectorAll("h1 br")).toHaveLength(1);
    expect(container.querySelector("[aria-label='How Malmoi works']")).not.toBeNull();

    // 섹션마다 이름이 있다(POSTMORTEM 2026-09-15) — 히어로·CTA는 자기 제목으로.
    // ⚠️ 개수를 먼저 센다 — 섹션이 `<div>`로 바뀌면 아래 루프가 0번 돌고 green이다(POSTMORTEM 2026-09-14).
    const sections = container.querySelectorAll("section");
    expect(sections).toHaveLength(3);
    for (const section of sections) {
      const named = section.hasAttribute("aria-label") || (section.getAttribute("aria-labelledby") ?? "") !== "";
      expect(named).toBe(true);
      const labelledBy = section.getAttribute("aria-labelledby");
      if (labelledBy) expect(container.querySelector(`[id="${labelledBy}"]`)).not.toBeNull();
    }

    const closing = container.querySelector("h2");
    expect(closing?.textContent).toBe(en.landing.closing.title);

    const starts = [...container.querySelectorAll("main a")].filter((a) => a.textContent === en.landing.shell.getStarted);
    // 히어로 · 마무리 CTA — 헤더의 것은 `<main>` 밖이다.
    expect(starts).toHaveLength(2);
    for (const a of starts) expect(a.getAttribute("href")).toBe(routes.signIn());
    const docs = [...container.querySelectorAll("main a")].filter((a) => a.textContent === en.landing.shell.docs);
    expect(docs.map((a) => a.getAttribute("href"))).toEqual([routes.docs()]);
  });

  /**
   * **마무리 CTA** (2026-09-27 사용자) — 위아래 여백은 섹션 자신의 padding-block 240(히어로 간격 120의 두 배)이고,
   * 히어로는 GitHub(default · 같은 `lg` · 새 탭), 마무리는 Docs(default · 같은 `lg`)가 primary 앞에 선다.
   */
  it("히어로 GitHub → Get started · 마무리 Docs → Get started · 링크 동작과 크기를 보존한다", async () => {
    const { container } = await render(await page(status));
    const hero = container.querySelector("section[aria-labelledby=landing-hero]");
    const heroLinks = [...(hero?.querySelectorAll("a:not([data-landing-latest])") ?? [])];
    expect(heroLinks.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      [en.landing.shell.github, GITHUB_REPO_URL],
      [en.landing.shell.getStarted, routes.signIn()],
    ]);
    const closing = container.querySelector<HTMLElement>("section[aria-labelledby=landing-closing]");
    expect(closing?.className).toMatch(/(^|\s)py-60(\s|$)/);
    const links = [...(closing?.querySelectorAll("a") ?? [])];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      [en.landing.shell.docs, routes.docs()],
      [en.landing.shell.getStarted, routes.signIn()],
    ]);
    const [github, heroStart] = heroLinks;
    const [docs, start] = links;
    expect([docs?.getAttribute("target"), docs?.getAttribute("rel")]).toEqual([null, null]);
    expect([github?.getAttribute("target"), github?.getAttribute("rel")]).toEqual(["_blank", "noreferrer noopener"]);
    // 같은 크기 — `lg`(h-10 · rounded-lg). 변형은 default(테두리)와 primary다.
    for (const a of [...heroLinks, ...links]) expect(a.className).toContain("h-10");
    expect(docs?.className).toContain("border-input");
    expect(heroStart?.className).toContain("bg-primary");
    expect(github?.className).toContain("border-input");
    expect(start?.className).toContain("bg-primary");
    expect(github?.querySelector("svg.lucide-external-link, svg.lucide-arrow-up-right")).toBeNull();
  });

  /**
   * **CTA 버튼마다 선행 아이콘 하나** (2026-09-27 사용자, DESIGN §6.615) — Docs는 앱 셸 `Docs` 항목과 같은 글리프 · Get started `LogIn` · GitHub는
   * 리포의 유일한 GitHub 글리프 `GithubIcon`(`components/signin/brand-icons.tsx` — lucide 1.37에 `github`가 없다). 전부 장식이라 `aria-hidden`이고,
   * 크기는 `Button`의 svg 슬롯(16)이 정한다 — 첫 자식이 svg여야 "선행"이다.
   */
  it("CTA 버튼 넷이 선행 아이콘을 `aria-hidden`으로 든다", async () => {
    const { container } = await render(await page(status));
    const hero = container.querySelector("section[aria-labelledby=landing-hero]");
    const closing = container.querySelector("section[aria-labelledby=landing-closing]");
    const buttons = [...(hero?.querySelectorAll("a:not([data-landing-latest])") ?? []), ...(closing?.querySelectorAll("a") ?? [])];
    expect(buttons).toHaveLength(4);
    for (const a of buttons) {
      const first = a.firstElementChild;
      expect(first?.tagName.toLowerCase()).toBe("svg");
      expect(first?.getAttribute("aria-hidden")).toBe("true");
      expect(first?.getAttribute("class") ?? "").not.toMatch(/size-/);
    }
    const icon = (a: Element | undefined) => a?.firstElementChild?.getAttribute("class") ?? "";
    // Docs는 `navFooterItems`의 Docs 항목과 같은 글리프다 — 셸이 바꾸면 랜딩도 따라간다.
    const docsIcon = navFooterItems(en).find((item) => item.key === "docs")?.icon;
    expect(docsIcon).toBeDefined();
    const expected = docsIcon ? /class="([^"]*)"/.exec(renderToStaticMarkup(createElement(docsIcon)))?.[1] : undefined;
    expect(icon(buttons[2])).toBe(expected);
    expect(icon(buttons[1])).toContain("lucide-log-in");
    expect(icon(buttons[3])).toContain("lucide-log-in");
    // GitHub 글리프는 lucide 클래스가 없는 리포 자산이다 — `GithubIcon`과 마크업이 같은지로 가린다.
    expect(buttons[0]?.firstElementChild?.outerHTML).toBe(renderToStaticMarkup(createElement(GithubIcon)));
  });

  /**
   * **h1 위의 최신 changelog 알약** (2026-09-30 사용자) — 배포된 앱 버전(`APP_VERSION`)을 싣고 `/changelog`로 간다(같은 탭).
   * GitHub를 부르지 않는다 — 랜딩이 외부 API 지연에 묶이지 않게. 버전이 비면 버전 없는 문구로 떨어진다.
   */
  it("h1 위에 최신 버전 알약이 서고 `/changelog`로 간다", async () => {
    vi.stubEnv("APP_VERSION", "1.2.3");
    const { container } = await render(await page(status));
    const hero = container.querySelector("section[aria-labelledby=landing-hero]");
    const pill = hero?.querySelector<HTMLAnchorElement>("a[data-landing-latest]");
    expect(pill?.textContent).toBe("What's new in v1.2.3");
    expect(pill?.getAttribute("href")).toBe(routes.changelog());
    expect(pill?.hasAttribute("target")).toBe(false);
    // 화살표는 뒤에 서는 장식이다.
    expect(pill?.lastElementChild?.getAttribute("class")).toContain("lucide-arrow-right");
    expect(pill?.lastElementChild?.getAttribute("aria-hidden")).toBe("true");
    // h1보다 앞이다.
    const h1 = hero?.querySelector("h1");
    expect(pill && h1 ? pill.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING : 0).toBeTruthy();
  });

  it("버전이 비면 `Latest changelog`다", async () => {
    vi.stubEnv("APP_VERSION", "");
    const { container } = await render(await page(status));
    expect(container.querySelector("a[data-landing-latest]")?.textContent).toBe("Latest changelog");
  });

  it("목업 프레임은 `aria-hidden`이고 캡션 다섯은 숨은 `<ol>`이 든다", async () => {
    const { container } = await render(await page(status));
    expect(container.querySelector("[data-landing-frame]")?.getAttribute("aria-hidden")).toBe("true");
    expect([...container.querySelectorAll("ol li")].map((li) => li.textContent)).toEqual([...en.landing.stage.captions]);
  });
});

/** 구조화 데이터 (seo-geo T7) — 랜딩 1장. validator 대조는 배포 뒤 수동(M3)이다. */
describe("`/` — JSON-LD", () => {
  it("`SoftwareApplication`·`Organization` 한 장", async () => {
    const { container } = await render(await page("none"));
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const ld = JSON.parse(scripts[0]?.textContent ?? "null") as { "@type": string }[];
    expect(ld.map((item) => item["@type"])).toEqual(["SoftwareApplication", "Organization"]);
  });
});
