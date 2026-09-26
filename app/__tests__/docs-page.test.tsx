// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * **`/docs/*` — 원고 렌더** (DESIGN §6.61 · 시안 `Docs.dc.html` 1a–1d). 실물 `guide/`를 읽는다 — 원고가 움직이면 여기서 red다.
 * 시각 값의 대조는 `/design-sync`의 몫이고, 여기는 구조(어떤 페이지에 무엇이 서는가)만 본다.
 */
const mocks = vi.hoisted(() => ({ path: "/docs", replace: vi.fn() }));

vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "none" }) }));
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

describe("`/docs` — 개요(1a)", () => {
  it("두 갈래 카드와 `More in the docs` — 목차·이전/다음이 없다", async () => {
    const { container } = await page(undefined);
    expect(container.textContent).toContain(m.publicDocs.docs.forDevelopers);
    expect(container.textContent).toContain(m.publicDocs.docs.forTranslators);
    expect([...container.querySelectorAll("h2")].map((h) => h.textContent)).toContain(m.publicDocs.docs.more);
    const hrefs = [...container.querySelectorAll("article a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(routes.docs("setup"));
    expect(hrefs).toContain(routes.docs("translate"));
    expect(hrefs).toContain(routes.docs("reference"));
    expect(container.querySelector(`nav[aria-label="${m.publicDocs.docs.pages}"]`)).toBeNull();
    expect(container.querySelector(`nav[aria-labelledby]`)).toBeNull();
  });

  it("헤더 Docs가 current · 내비의 개요 행이 current다", async () => {
    const { container } = await page(undefined);
    const header = [...container.querySelectorAll(`nav[aria-label="${m.landing.shell.nav}"] a`)];
    expect(header.find((a) => a.getAttribute("aria-current") === "page")?.textContent).toBe(m.landing.shell.docs);
    const current = container.querySelectorAll(`nav[aria-label="${m.publicDocs.docs.nav}"] [aria-current="page"]`);
    expect([...current].map((a) => a.getAttribute("href"))).toEqual([routes.docs()]);
  });

  it("옛 해시 `#formats`는 새 페이지로 replace된다", async () => {
    history.replaceState(null, "", "/docs#formats");
    await page(undefined);
    expect(mocks.replace).toHaveBeenCalledWith("/docs/reference/formats#formats");
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
    const neighbours = container.querySelector(`nav[aria-label="${m.publicDocs.docs.pages}"]`);
    expect([...(neighbours?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"))).toEqual([
      routes.docs("setup/create-project"),
      routes.docs("setup/allowed-actions"),
    ]);
  });

  it("내비는 현재 페이지 행 하나만 current다", async () => {
    const { container } = await page(["setup", "workflow"]);
    const current = container.querySelectorAll(`nav[aria-label="${m.publicDocs.docs.nav}"] [aria-current="page"]`);
    expect([...current].map((a) => a.getAttribute("href"))).toEqual([routes.docs("setup/workflow")]);
  });
});

describe("`/docs/translate` — 장 개요(1c)", () => {
  it("하위 페이지 목록은 SUMMARY 자식이다 — 목차·h1 위 줄 없음", async () => {
    const { container } = await page(["translate"]);
    const hrefs = [...container.querySelectorAll("article ul a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([routes.docs("translate/join"), routes.docs("translate/edit"), routes.docs("translate/publish")]);
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
    expect(container.querySelector("article h1")?.textContent).toBe(m.publicDocs.docs.notFound.title);
    expect(container.querySelector("article code")?.textContent).toBe("/docs/nope");
    expect([...container.querySelectorAll("article a")].map((a) => a.getAttribute("href"))).toEqual([routes.docs()]);
    expect(container.querySelectorAll(`nav[aria-label="${m.publicDocs.docs.nav}"] [aria-current]`)).toHaveLength(0);
  });
});
