// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { act, createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PublicFooter } from "@/components/public-shell/footer";
import { PublicShell } from "@/components/public-shell/public-shell";
import { AuthLayout } from "@/components/signin/auth-layout";
import { publicCta } from "@/lib/auth/landing";
import { m } from "@/lib/i18n";
import { FOOTER_LINKS, GITHUB_REPO_URL } from "@/lib/links";
import { routes } from "@/lib/routes";

import { render } from "./helpers/dom";

/**
 * 공개 셸 (DESIGN §6.615) — 헤더 · 패널(표면 + 스크롤러) · 푸터. 랜딩(`/`)과 `/privacy`가 쓴다.
 *
 * ⚠️ **문서가 스크롤되지 않는 셸이라 스크롤러가 포커스를 받아야 키보드 스크롤이 산다** — body에
 * 포커스가 있으면 Space/PageDown이 root scroller만 민다(DESIGN §6.615 "키보드").
 */
/** 랜딩이 넘기는 값 그대로 — `app/page.tsx`. */
const shell = () => render(h(PublicShell, { cta: publicCta("none"), current: "home", children: h("p", null, "landing body") }));

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
  it("로고가 Home으로 가고 이름을 갖는다", async () => {
    const { container } = await shell();
    const logo = container.querySelector(`header a[aria-label="${m.landing.shell.logo}"]`);
    expect(m.landing.shell.logo).toBe("Malmoi home");
    expect(logo?.getAttribute("href")).toBe(routes.home());
  });

  it("Main 내비가 Home · Docs · GitHub 순이고 Home만 aria-current다", async () => {
    const { container } = await shell();
    const nav = container.querySelector(`nav[aria-label="${m.landing.shell.nav}"]`);
    expect(m.landing.shell.nav).toBe("Main");
    const links = [...(nav?.querySelectorAll("a") ?? [])];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      [m.landing.shell.home, routes.home()],
      [m.landing.shell.docs, routes.docs()],
      [m.landing.shell.github, GITHUB_REPO_URL],
    ]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual(["page", null, null]);
    expect(links[2]?.getAttribute("target")).toBe("_blank");
  });

  it("CTA는 Get started 하나이고 로그인으로 간다", async () => {
    const { container } = await shell();
    const cta = [...container.querySelectorAll("header a")].filter((a) => a.textContent === m.landing.shell.getStarted);
    expect(m.landing.shell.getStarted).toBe("Get started");
    expect(cta).toHaveLength(1);
    expect(cta[0]?.getAttribute("href")).toBe(routes.signIn());
  });

  /** `/privacy`는 헤더 링크 어디에도 없는 화면이다 — current를 안 넘기면 어느 링크도 current가 아니다. */
  it("`current`가 없으면 헤더에 `aria-current`가 없다", async () => {
    const { container } = await render(h(PublicShell, { cta: publicCta("none"), children: h("p", null, "body") }));
    expect(container.querySelectorAll("header [aria-current]")).toHaveLength(0);
  });

  it("CTA는 받은 href·라벨 키 그대로 선다", async () => {
    const { container } = await render(h(PublicShell, { cta: publicCta("ok"), children: h("p", null, "body") }));
    const primary = container.querySelector("header > div a");
    expect(m.landing.shell.openMalmoi).toBe("Open Malmoi");
    expect([primary?.textContent, primary?.getAttribute("href")]).toEqual([m.landing.shell.openMalmoi, routes.projects()]);
  });
});

/**
 * ⚠️ **외부 링크를 그리는 자리가 셋이다**(랜딩 헤더 · 공개 셸 푸터 · `/signin`) — 목록 동등성 검사는 href만 보므로
 * 한쪽이 `rel`·`target`을 잃어도 못 잡는다. 셋을 따로 센다(`/signin`은 2026-09-26부터 같은 `PublicFooter`를 그린다).
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
    signin.innerHTML = renderToStaticMarkup(h(AuthLayout, null, null));
    external([...signin.querySelectorAll("footer a")]);
  });
});

describe("푸터 — `/signin`·초대·계정 병합도 공개 셸 푸터 하나다", () => {
  const signin = () => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(h(AuthLayout, null, h("p", null, "form")));
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
    const own = renderToStaticMarkup(h(PublicFooter));
    expect(signin().querySelector("footer")?.outerHTML).toBe(own);
  });

  it("공개 셸과 같은 좌표다 — 바깥 `px-2 pt-2`, 푸터가 바닥 40을 든다", () => {
    const outer = signin().querySelector("footer")?.parentElement;
    expect(outer?.className.split(/\s+/)).toEqual(expect.arrayContaining(["flex", "flex-col", "min-h-svh", "min-w-[1280px]", "px-2", "pt-2"]));
    expect(outer?.className.split(/\s+/)).not.toContain("p-2");
    expect(outer?.lastElementChild?.tagName).toBe("FOOTER");
  });
});

describe("푸터 링크 — `/signin`과 한 목록", () => {
  const pairs = (root: ParentNode) =>
    [...root.querySelectorAll("footer a")].map((a) => [a.textContent, a.getAttribute("href")]);

  it("순서가 GitHub · Privacy Policy · Docs다", () => {
    expect(FOOTER_LINKS.map(({ label, href }) => [label, href])).toEqual([
      [m.signIn.footer.github, GITHUB_REPO_URL],
      [m.signIn.footer.privacy, routes.privacy()],
      [m.signIn.footer.docs, routes.docs()],
    ]);
  });

  it("랜딩 푸터와 로그인 푸터가 같은 링크를 같은 순서로 낸다", async () => {
    const { container } = await shell();
    const signin = document.createElement("div");
    signin.innerHTML = renderToStaticMarkup(h(AuthLayout, null, null));
    expect(pairs(container)).toEqual(pairs(signin));
    expect(pairs(container)).toEqual(FOOTER_LINKS.map(({ label, href }) => [label, href]));
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
    expect(all).toContain("min-w-[1280px]");
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
