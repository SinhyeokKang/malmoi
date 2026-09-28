// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import type { SessionRead } from "@/lib/auth/read-session";
import type { LoadedReleases } from "@/lib/changelog/load";
import { m } from "@/lib/i18n";
import { FOOTER_LINKS, GITHUB_RELEASES_URL } from "@/lib/links";
import { routes } from "@/lib/routes";

/**
 * **`/changelog`는 공개 셸 안의 공개 페이지다** (spec 결정). GitHub가 실패하거나 0건이어도 페이지는 서고
 * GitHub Releases로 가는 안내 문장이 대신한다 — 에러 경계로 떨어지지 않는다.
 */
const mocks = vi.hoisted(() => ({ status: "none" as SessionRead["status"], loaded: { ok: false } as LoadedReleases }));

vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: mocks.status }) }));
vi.mock("@/lib/changelog/load", () => ({ loadReleases: async () => mocks.loaded }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const TWO = [
  { tag: "v1.0.1", publishedAt: "2026-09-27T16:34:14Z", body: "## Fixes\n\n- One fix." },
  { tag: "v1.0.0", publishedAt: "2026-09-27T12:32:05Z", body: "## Highlights\n\nFirst." },
];

async function page(loaded: LoadedReleases, status: SessionRead["status"] = "none") {
  mocks.loaded = loaded;
  mocks.status = status;
  const { default: Changelog } = await import("@/app/changelog/page");
  return (await render(await Changelog())).container;
}

const main = (container: HTMLElement) => container.querySelector("main")!;
const releasesLinks = (root: ParentNode) => [...root.querySelectorAll("a")].filter((a) => a.getAttribute("href") === GITHUB_RELEASES_URL);

function expectExternal(links: Element[]) {
  expect(links.length).toBeGreaterThan(0);
  for (const a of links) {
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")?.split(/\s+/)).toContain("noreferrer");
  }
}

describe("`/changelog` — 공개 셸", () => {
  it("본문 랜드마크 하나 안에 제목이 서고, 헤더의 Changelog만 current다", async () => {
    const container = await page({ ok: true, releases: TWO, truncated: false });
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(main(container).querySelector("h1")?.textContent).toBe(m.changelog.title);
    const current = [...container.querySelectorAll("header [aria-current]")];
    expect(current.map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")])).toEqual([
      [m.changelog.title, routes.changelog(), "page"],
    ]);
  });

  it("푸터가 공개 셸의 링크 목록이다", async () => {
    const container = await page({ ok: false });
    expect([...container.querySelectorAll("footer a")].map((a) => a.getAttribute("href"))).toEqual(FOOTER_LINKS.map(({ href }) => href));
  });

  it("헤더 primary는 세션으로 갈린다", async () => {
    const container = await page({ ok: false }, "ok");
    expect(container.querySelector("header > div a")?.getAttribute("href")).toBe(routes.projects());
  });

  it("소개 문장이 UTC와 GitHub Releases를 말한다", async () => {
    const container = await page({ ok: true, releases: TWO, truncated: false });
    const intro = main(container).querySelector("h1 + p");
    expect(intro?.textContent).toContain("Dates are in UTC.");
    expectExternal(releasesLinks(intro!));
  });
});

describe("`/changelog` — 목록", () => {
  it("릴리스가 받은 순서대로 항목이 된다", async () => {
    const container = await page({ ok: true, releases: TWO, truncated: false });
    expect([...main(container).querySelectorAll("h2")].map((h) => h.id)).toEqual(["v1.0.1", "v1.0.0"]);
    expect(main(container).textContent).not.toContain("couldn't be loaded");
  });

  it("실패면 안내 문장 하나이고 항목이 없다", async () => {
    const container = await page({ ok: false });
    expect(main(container).querySelectorAll("h2")).toHaveLength(0);
    expect(main(container).textContent).toContain("The changelog couldn't be loaded from GitHub just now.");
    expectExternal(releasesLinks(main(container)));
    expect(releasesLinks(main(container))).toHaveLength(2);
  });

  it("빈 목록이면 빈 목록 문장이다", async () => {
    const container = await page({ ok: true, releases: [], truncated: false });
    expect(main(container).querySelectorAll("h2")).toHaveLength(0);
    expect(main(container).textContent).toContain("No releases have been published yet.");
    expect(releasesLinks(main(container))).toHaveLength(2);
  });

  it("한 요청 상한에 닿았으면 목록 끝에 Older releases 문장이 선다", async () => {
    const container = await page({ ok: true, releases: TWO, truncated: true });
    const paragraphs = [...main(container).querySelectorAll("p")];
    expect(paragraphs.at(-1)?.textContent).toBe("Older releases are on GitHub Releases.");
    expectExternal(releasesLinks(main(container)));
  });

  it("상한 아래면 Older releases 문장이 없다", async () => {
    const container = await page({ ok: true, releases: TWO, truncated: false });
    expect(main(container).textContent).not.toContain("Older releases");
  });
});
