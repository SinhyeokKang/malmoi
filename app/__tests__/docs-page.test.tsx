// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { en } from "@/messages/en";
import { routes } from "@/lib/routes";

/**
 * **`/docs/*` — 원고 렌더** (DESIGN §6.61 · 시안 `Docs.dc.html` 1a–1d). 실물 `guide/`를 읽는다 — 원고가 움직이면 여기서 red다.
 * 시각 값의 대조는 `/design-sync`의 몫이고, 여기는 구조(어떤 페이지에 무엇이 서는가)만 본다.
 */
/*
  ⚠️ **`testTimeout`을 이 파일에서만 올린다** (2026-09-29 실측). 파일의 첫 `page()`가 페이지·레이아웃 모듈의 콜드 import를
  그 테스트의 예산 안에서 치러(단독 2.4 s) 전체 스위트 부하에서 기본 5 s를 한 번씩 넘겼다. 다른 무거운 DOM 파일과 같은 값이다.
*/
vi.setConfig({ testTimeout: 20_000 });

const mocks = vi.hoisted(() => ({ path: "/docs", replace: vi.fn(), uiLocale: "en" as "en" | "ko" }));

vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "none" }) }));
// 화면 언어는 쿠키·세션에서 오고 렌더 요청 밖에서는 `cookies()`가 던진다 — 요청의 언어를 여기서 정한다
vi.mock("@/lib/i18n/server", async () => ({
  getUiLocale: async () => {
    return mocks.uiLocale;
  },
  getMessages: async () => {
    return mocks.uiLocale === "ko" ? (await import("@/messages/ko")).ko : (await import("@/messages/en")).en;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.path,
  useRouter: () => ({ replace: mocks.replace }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  mocks.replace.mockReset();
  mocks.uiLocale = "en";
});
afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

async function page(slug: string[] | undefined) {
  mocks.path = routes.docs(slug?.join("/"));
  const { default: Docs } = await import("@/app/docs/[[...slug]]/page");
  const { default: Layout } = await import("@/app/docs/layout");
  return render(await Layout({ children: await Docs({ params: Promise.resolve(slug === undefined ? {} : { slug }) }) }));
}

describe("`/docs/*` — 셸 (#119)", () => {
  it("문서 내비의 이름은 `Docs`다(시안 1a)", () => {
    expect(en.publicDocs.docs.nav).toBe("Docs");
  });

  /** 시안: h1 뒤 도입 문단 위 20 — 본문 문단의 16과 다르다. 원고 문단은 react-markdown이 그려 그릇이 `h1 + p`로 누른다. */
  it("도입 문단(h1 바로 뒤)은 그릇이 mt 20으로 누른다", async () => {
    const { container } = await page(["setup", "workflow"]);
    const article = container.querySelector("article");
    expect(article?.className).toContain("[&>h1+p]:mt-5");
    expect(article?.querySelector(":scope > h1 + p")).not.toBeNull();
  });
});

describe("`/docs` — 개요(1a)", () => {
  /** 시안 1a — 갈래 행은 `→`, `More in the docs` 행은 화살표 없음(#119). 장 개요(1c) 행은 아래에서 본다. */
  it("화살표 — 갈래 행만 `→`이고 `More` 행엔 없다", async () => {
    const { container } = await page(undefined);
    const more = [...container.querySelectorAll("h2")].find((h) => h.textContent === en.publicDocs.docs.more)?.nextElementSibling;
    expect(more?.tagName).toBe("UL");
    expect(more?.querySelectorAll("[data-arrow]")).toHaveLength(0);
    const trackRows = [...container.querySelectorAll("article a")].filter((a) => a.getAttribute("href") === routes.docs("setup/workflow"));
    expect(trackRows[0]?.querySelector("[data-arrow]")?.textContent).toBe("→");
  });

  it("두 갈래 카드와 `More in the docs` — 목차·이전/다음이 없다", async () => {
    const { container } = await page(undefined);
    expect(container.textContent).toContain(en.publicDocs.docs.forDevelopers);
    expect(container.textContent).toContain(en.publicDocs.docs.forTranslators);
    expect([...container.querySelectorAll("h2")].map((h) => h.textContent)).toContain(en.publicDocs.docs.more);
    const hrefs = [...container.querySelectorAll("article a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(routes.docs("setup"));
    expect(hrefs).toContain(routes.docs("translate"));
    expect(hrefs).toContain(routes.docs("reference"));
    expect(container.querySelector(`nav[aria-label="${en.publicDocs.docs.pages}"]`)).toBeNull();
    expect(container.querySelector(`nav[aria-labelledby]`)).toBeNull();
  });

  it("헤더 Docs가 current · 내비의 개요 행이 current다", async () => {
    const { container } = await page(undefined);
    const header = [...container.querySelectorAll(`nav[aria-label="${en.landing.shell.nav}"] a`)];
    expect(header.find((a) => a.getAttribute("aria-current") === "page")?.textContent).toBe(en.landing.shell.docs);
    const current = container.querySelectorAll(`nav[aria-label="${en.publicDocs.docs.nav}"] [aria-current="page"]`);
    expect([...current].map((a) => a.getAttribute("href"))).toEqual([routes.docs()]);
  });

  it("옛 해시 `#formats`는 새 페이지로 replace된다", async () => {
    history.replaceState(null, "", "/docs#formats");
    await page(undefined);
    expect(mocks.replace).toHaveBeenCalledWith("/docs/reference/formats#formats");
  });

  it("섹션으로 나뉜 옛 `/docs/ai-agents#token`은 새 페이지로 replace된다 (malmoi#152)", async () => {
    history.replaceState(null, "", "/docs/ai-agents#token");
    await page(["ai-agents"]);
    expect(mocks.replace).toHaveBeenCalledWith("/docs/ai-agents/token#token");
  });

  it("표에 없는 해시는 그대로 둔다", async () => {
    history.replaceState(null, "", "/docs#nope");
    await page(undefined);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("`/docs/setup/workflow` — 일반 문서(1b)", () => {
  it("h1 위 줄이 장 이름이고, 목차·이전/다음이 선다", async () => {
    const { container } = await page(["setup", "workflow"]);
    const h1 = container.querySelector("article h1");
    expect(h1?.previousElementSibling?.textContent).toBe("Set up a project");
    expect(container.querySelector("h2#workflow")).not.toBeNull();
    expect(container.querySelector(`a[href="#workflow"]`)).not.toBeNull();
    const neighbours = container.querySelector(`nav[aria-label="${en.publicDocs.docs.pages}"]`);
    expect([...(neighbours?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"))).toEqual([
      routes.docs("setup/create-project"),
      routes.docs("setup/allowed-actions"),
    ]);
  });

  it("내비는 현재 페이지 행 하나만 current다", async () => {
    const { container } = await page(["setup", "workflow"]);
    const current = container.querySelectorAll(`nav[aria-label="${en.publicDocs.docs.nav}"] [aria-current="page"]`);
    expect([...current].map((a) => a.getAttribute("href"))).toEqual([routes.docs("setup/workflow")]);
  });
});

describe("`/docs/translate` — 장 개요(1c)", () => {
  it("하위 페이지 목록은 SUMMARY 자식이다 — 목차·h1 위 줄 없음", async () => {
    const { container } = await page(["translate"]);
    const hrefs = [...container.querySelectorAll("article ul a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([routes.docs("translate/join"), routes.docs("translate/edit"), routes.docs("translate/publish")]);
    for (const a of container.querySelectorAll("article ul a")) expect(a.querySelector("[data-arrow]")?.textContent).toBe("→");
    expect(container.querySelector(`nav[aria-labelledby]`)).toBeNull();
    expect(container.querySelector("article h1")?.previousElementSibling).toBeNull();
  });
});

describe("`/docs/*` — 404", () => {
  it.each([["nope"], ["AUTHORING"], ["SHOOTING"], ["SUMMARY"], ["setup", "workflow", "extra"], ["__proto__"]])("%s → notFound", async (...slug) => {
    const { default: Docs } = await import("@/app/docs/[[...slug]]/page");
    await expect(Docs({ params: Promise.resolve({ slug }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404 화면이 요청 주소를 되비치고 개요로 가는 링크 하나를 준다 — 내비 current 없음", async () => {
    mocks.path = "/docs/nope";
    const { default: NotFound } = await import("@/app/docs/not-found");
    const { default: Layout } = await import("@/app/docs/layout");
    const { container } = await render(await Layout({ children: NotFound() }));
    expect(container.querySelector("article h1")?.textContent).toBe(en.publicDocs.docs.notFound.title);
    expect(container.querySelector("article code")?.textContent).toBe("/docs/nope");
    expect([...container.querySelectorAll("article a")].map((a) => a.getAttribute("href"))).toEqual([routes.docs()]);
    expect(container.querySelectorAll(`nav[aria-label="${en.publicDocs.docs.nav}"] [aria-current]`)).toHaveLength(0);
  });

  /** 시안 1d — 주소와 복귀 링크가 **한 문단**이다(#119). 링크는 문장 안의 `docs overview`다. */
  it("404 본문은 h1 뒤 한 문단 — 주소 · 안내 · 문장 안 링크", async () => {
    mocks.path = "/docs/nope";
    const { default: NotFound } = await import("@/app/docs/not-found");
    const { default: Layout } = await import("@/app/docs/layout");
    const { container } = await render(await Layout({ children: NotFound() }));
    const paragraphs = [...container.querySelectorAll("article h1 ~ p")];
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe("There's no page at /docs/nope. Pick a page from the list, or start from the docs overview.");
    expect(paragraphs[0]?.querySelector("a")?.textContent).toBe("docs overview");
  });
});

/** 구조화 데이터 (seo-geo T7) — 하위 페이지 1장, 개요 0장. 장 URL은 `docHref([slug[0]])`다(SUMMARY가 2단이라는 전제). */
describe("`/docs/*` — JSON-LD", () => {
  type Crumb = { position: number; name: string; item: string };
  const ld = (container: HTMLElement) =>
    [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (script) => JSON.parse(script.textContent ?? "null") as { "@type": string; itemListElement?: Crumb[] }[],
    );

  it("개요에는 없다 — 1항목 breadcrumb는 무의미하다", async () => {
    const { container } = await page(undefined);
    expect(ld(container)).toHaveLength(0);
  });

  it("깊은 페이지 — TechArticle + Docs › 장 › 페이지", async () => {
    const { container } = await page(["setup", "create-project"]);
    const scripts = ld(container);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.map((item) => item["@type"])).toEqual(["TechArticle", "BreadcrumbList"]);
    expect(scripts[0]?.[1]?.itemListElement).toEqual([
      expect.objectContaining({ position: 1, name: en.publicDocs.docs.title, item: "https://mal-moi.com/docs" }),
      expect.objectContaining({ position: 2, name: "Set up a project", item: "https://mal-moi.com/docs/setup" }),
      expect.objectContaining({ position: 3, name: "Create a project", item: "https://mal-moi.com/docs/setup/create-project" }),
    ]);
  });

  it("장 개요 — 2항목", async () => {
    const { container } = await page(["translate"]);
    expect(ld(container)[0]?.[1]?.itemListElement?.map((crumb) => crumb.position)).toEqual([1, 2]);
  });

  it("FAQ는 Docs › FAQ — 루트 장을 중복하지 않는다", async () => {
    const { container } = await page(["faq"]);
    expect(ld(container)[0]?.[1]?.itemListElement).toEqual([
      expect.objectContaining({ position: 1, name: "Docs", item: "https://mal-moi.com/docs" }),
      expect.objectContaining({ position: 2, name: "FAQ", item: "https://mal-moi.com/docs/faq" }),
    ]);
  });

  it("ko 문서는 inLanguage과 breadcrumb 루트 라벨을 본문 언어로 낸다", async () => {
    mocks.uiLocale = "ko";
    const { container } = await page(["translate", "edit"]);
    const items = ld(container)[0] ?? [];
    expect(items[0]).toMatchObject({ "@type": "TechArticle", inLanguage: "ko" });
    expect(items[1]?.itemListElement?.[0]).toMatchObject({ name: "문서", item: "https://mal-moi.com/docs" });
  });
});

describe("`/docs/*` — 화면 언어의 원고 (ui-locales design §6.1)", () => {
  it("ko면 내비와 본문이 guide/ko에서 온다 — URL·절 id·이미지 경로는 en과 같다", async () => {
    const en = await page(["translate", "edit"]);
    const enImages = [...en.container.querySelectorAll("article img")].map((img) => img.getAttribute("src"));
    const enIds = [...en.container.querySelectorAll("article h2")].map((h) => h.id);

    mocks.uiLocale = "ko";
    const { container } = await page(["translate", "edit"]);
    expect(container.querySelector("article h1")?.textContent).toBe("번역 편집");
    expect([...container.querySelectorAll("nav a")].some((a) => a.textContent === "프로젝트 설정" && a.getAttribute("href") === routes.docs("setup"))).toBe(true);
    expect([...container.querySelectorAll("article img")].map((img) => img.getAttribute("src"))).toEqual(enImages);
    expect([...container.querySelectorAll("article h2")].map((h) => h.id)).toEqual(enIds);
    expect(enImages.length).toBeGreaterThan(0);
  });
});
