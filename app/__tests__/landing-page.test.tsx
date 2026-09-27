// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import type { SessionRead } from "@/lib/auth/read-session";
import { m } from "@/lib/i18n";
import { GITHUB_REPO_URL } from "@/lib/links";
import { routes } from "@/lib/routes";

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
afterEach(() => { vi.unstubAllGlobals(); });

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
    expect(h1?.textContent).toBe(m.landing.hero.title.join(""));
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
    expect(closing?.textContent).toBe(m.landing.closing.title);

    const starts = [...container.querySelectorAll("main a")].filter((a) => a.textContent === m.landing.shell.getStarted);
    // 히어로 · 마무리 CTA — 헤더의 것은 `<main>` 밖이다.
    expect(starts).toHaveLength(2);
    for (const a of starts) expect(a.getAttribute("href")).toBe(routes.signIn());
    const docs = [...container.querySelectorAll("main a")].filter((a) => a.textContent === m.landing.shell.docs);
    expect(docs.map((a) => a.getAttribute("href"))).toEqual([routes.docs()]);
  });

  /**
   * **마무리 CTA** (2026-09-27 사용자) — 위아래 여백은 섹션 자신의 padding-block 240(히어로 간격 120의 두 배)이고,
   * primary 옆에 GitHub(default · 같은 `lg`)가 선다. 새 탭 · 외부 링크 글리프 없음(DESIGN §6.3).
   */
  it("마무리 CTA — padding-block 240 · GitHub(default lg, 새 탭) + Get started", async () => {
    const { container } = await render(await page(status));
    const closing = container.querySelector<HTMLElement>("section[aria-labelledby=landing-closing]");
    expect(closing?.className).toMatch(/(^|\s)py-60(\s|$)/);
    const links = [...(closing?.querySelectorAll("a") ?? [])];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      [m.landing.shell.github, GITHUB_REPO_URL],
      [m.landing.shell.getStarted, routes.signIn()],
    ]);
    const [github, start] = links;
    expect([github?.getAttribute("target"), github?.getAttribute("rel")]).toEqual(["_blank", "noreferrer"]);
    // 같은 크기 — `lg`(h-10 · rounded-lg). 변형은 default(테두리)와 primary다.
    for (const a of links) expect(a.className).toContain("h-10");
    expect(github?.className).toContain("border-input");
    expect(start?.className).toContain("bg-primary");
    expect(github?.querySelector("svg.lucide-external-link, svg.lucide-arrow-up-right")).toBeNull();
  });

  /**
   * **CTA 버튼마다 선행 아이콘 하나** (2026-09-27 사용자, DESIGN §6.615) — Docs `BookOpen` · Get started `LogIn` · GitHub는
   * 리포의 유일한 브랜드 마크(`components/sources/github-mark.tsx` — lucide 1.37에 `github`가 없다). 전부 장식이라 `aria-hidden`이고,
   * 크기는 `Button`의 svg 슬롯(16)이 정한다 — 첫 자식이 svg여야 "선행"이다.
   */
  it("CTA 버튼 넷이 선행 아이콘을 `aria-hidden`으로 든다", async () => {
    const { container } = await render(await page(status));
    const hero = container.querySelector("section[aria-labelledby=landing-hero]");
    const closing = container.querySelector("section[aria-labelledby=landing-closing]");
    const buttons = [...(hero?.querySelectorAll("a") ?? []), ...(closing?.querySelectorAll("a") ?? [])];
    expect(buttons).toHaveLength(4);
    for (const a of buttons) {
      const first = a.firstElementChild;
      expect(first?.tagName.toLowerCase()).toBe("svg");
      expect(first?.getAttribute("aria-hidden")).toBe("true");
      expect(first?.getAttribute("class") ?? "").not.toMatch(/size-/);
    }
    const icon = (a: Element | undefined) => a?.firstElementChild?.getAttribute("class") ?? "";
    expect(icon(buttons[0])).toContain("lucide-book-open");
    expect(icon(buttons[1])).toContain("lucide-log-in");
    expect(icon(buttons[3])).toContain("lucide-log-in");
    // GitHub 마크는 lucide 클래스가 없는 리포 자산이다 — 경로 둘(얼굴 · 꼬리)이 그것을 가린다.
    expect(buttons[2]?.firstElementChild?.querySelectorAll("path")).toHaveLength(2);
  });

  it("목업 프레임은 `aria-hidden`이고 캡션 다섯은 숨은 `<ol>`이 든다", async () => {
    const { container } = await render(await page(status));
    expect(container.querySelector("[data-landing-frame]")?.getAttribute("aria-hidden")).toBe("true");
    expect([...container.querySelectorAll("ol li")].map((li) => li.textContent)).toEqual([...m.landing.stage.captions]);
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
