// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import type { SessionRead } from "@/lib/auth/read-session";
import type { LoadedReleases } from "@/lib/changelog/load";
import { en } from "@/messages/en";
import { footerLinks, GITHUB_RELEASES_URL } from "@/lib/links";
import { routes } from "@/lib/routes";

vi.mock("@/lib/i18n/server", async () => ({ getMessages: async () => (await import("@/messages/en")).en, getUiLocale: async () => "en" }));

/**
 * **`/changelog`는 공개 셸 안의 공개 페이지다** (spec 결정). GitHub가 실패하거나 0건이어도 페이지는 서고
 * GitHub Releases로 가는 안내 문장이 대신한다 — 에러 경계로 떨어지지 않는다.
 */
const mocks = vi.hoisted(() => ({ status: "none" as SessionRead["status"], loaded: { ok: false } as LoadedReleases }));

vi.mock("@/lib/auth/read-session", () => ({
  readSession: async () =>
    mocks.status === "ok" ? { status: "ok", userId: "u1", name: "Ada", email: "ada@x.dev", image: null } : { status: mocks.status },
}));
// 헤더가 로그아웃 Action을 참조로 넘긴다 — 실물은 `@/auth`를 물어 jsdom에서 세울 수 없다.
vi.mock("@/lib/auth/sign-out", () => ({ signOutAction: async () => {} }));
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
    expect(main(container).querySelector("h1")?.textContent).toBe(en.changelog.title);
    const current = [...container.querySelectorAll("header [aria-current]")];
    expect(current.map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")])).toEqual([
      [en.changelog.title, routes.changelog(), "page"],
    ]);
  });

  it("푸터가 공개 셸의 링크 목록이다", async () => {
    const container = await page({ ok: false });
    expect([...container.querySelectorAll("footer a")].map((a) => a.getAttribute("href"))).toEqual(footerLinks(en).map(({ href }) => href));
  });

  it("헤더 primary는 세션으로 갈린다", async () => {
    const container = await page({ ok: false }, "ok");
    expect(container.querySelector(`header button[aria-label="${en.common.nav.userMenu}"]`)).not.toBeNull();
    expect(container.querySelector(`header a[href="${routes.signIn()}"]`)).toBeNull();
  });

  it("소개 문장이 UTC와 GitHub Releases를 말한다", async () => {
    const container = await page({ ok: true, releases: TWO, truncated: false });
    const intro = main(container).querySelector("h1 + p");
    expect(intro?.textContent).toContain("Dates are in UTC.");
    expectExternal(releasesLinks(intro!));
  });
});

/**
 * 시안 1a·1c·1d: **항목마다 같은 틀**(위 선 + 위아래 40)이고 첫 항목도 예외가 아니다 — 소개 아래 40 뒤에 선이 한 번 선다.
 * 실패·빈 목록·100건 문장도 **첫 항목 자리의 같은 틀**에 선다. 값이 아니라 "같은 틀인가"를 센다.
 */
describe("`/changelog` — 항목 틀", () => {
  it("첫 항목도 나머지와 같은 틀이다", async () => {
    const container = await page({ ok: true, releases: TWO, truncated: false });
    const classes = [...main(container).querySelectorAll("section")].map((s) => s.className);
    expect(classes).toHaveLength(2);
    expect(new Set(classes).size).toBe(1);
    // 같은 문자열이어도 `first:`·`[&:first-child]:` 변형이면 첫 항목만 선·위 여백을 잃는다 — 특례 자체를 센다.
    // 부모(`[&>section:first-child]:`)에서 거는 길도 있어 목록 틀의 클래스도 본다.
    expect(classes[0]).not.toMatch(/first/);
    expect(main(container).querySelector("section")?.parentElement?.className).not.toMatch(/first/);
  });

  it("실패·빈 목록·100건 문장은 항목과 같은 틀에 선다", async () => {
    const entry = main(await page({ ok: true, releases: TWO, truncated: true }));
    const block = entry.querySelector("section")!.className;
    const olderBlock = [...entry.querySelectorAll("p")].at(-1)?.parentElement;
    expect(olderBlock?.className).toBe(block);
    const fallbacks: LoadedReleases[] = [{ ok: false }, { ok: true, releases: [], truncated: false }];
    for (const loaded of fallbacks) {
      const container = await page(loaded);
      const sentence = [...main(container).querySelectorAll("p")].at(-1);
      expect(sentence?.parentElement?.className).toBe(block);
      // 이름 없는 section을 두지 않는다(POSTMORTEM 2026-09-15) — 틀은 같고 태그는 div다.
      expect(sentence?.parentElement?.tagName).toBe("DIV");
    }
  });

  it("빈 목록에 100건이 겹치면 문장 둘이 각자 같은 틀에 선다", async () => {
    const block = main(await page({ ok: true, releases: TWO, truncated: false })).querySelector("section")!.className;
    const container = await page({ ok: true, releases: [], truncated: true });
    const sentences = [...main(container).querySelectorAll("h1 ~ div p")];
    expect(sentences.map((p) => p.textContent)).toEqual([
      "No releases have been published yet. New versions appear here and on GitHub Releases.",
      "Older releases are on GitHub Releases.",
    ]);
    for (const p of sentences) expect(p.parentElement?.className).toBe(block);
  });
});

describe("`/changelog` — 목록", () => {
  it("최신 버전에만 초록 Latest 배지가 버전·날짜·본문 위에 선다", async () => {
    const container = await page({ ok: true, releases: TWO, truncated: false });
    const sections = [...main(container).querySelectorAll("section")];
    const badge = sections[0]!.firstElementChild;
    expect(badge?.textContent).toBe("Latest");
    expect(badge?.className).toContain("bg-green-100/80");
    expect(badge?.className).toContain("text-green-800");
    expect(badge?.nextElementSibling?.tagName).toBe("H1");
    expect(badge?.nextElementSibling?.textContent).toBe(TWO[0]!.tag);
    expect(badge?.nextElementSibling?.nextElementSibling?.querySelector("time")?.textContent).toBe("Sep 27, 2026");
    expect(sections[1]!.textContent).not.toContain("Latest");
    for (const loaded of [{ ok: false }, { ok: true, releases: [], truncated: false }] as LoadedReleases[]) {
      expect(main(await page(loaded)).textContent).not.toContain("Latest");
    }
  });

  it("릴리스가 받은 순서대로 항목이 된다", async () => {
    const container = await page({ ok: true, releases: TWO, truncated: false });
    expect([...main(container).querySelectorAll("section > h1")].map((h) => h.id)).toEqual(["v1.0.1", "v1.0.0"]);
    expect(main(container).textContent).not.toContain("couldn't be loaded");
  });

  it("실패면 안내 문장 하나이고 항목이 없다", async () => {
    const container = await page({ ok: false });
    expect(main(container).querySelectorAll("section > h1")).toHaveLength(0);
    expect(main(container).textContent).toContain("The changelog couldn't be loaded from GitHub just now.");
    expectExternal(releasesLinks(main(container)));
    expect(releasesLinks(main(container))).toHaveLength(2);
  });

  it("빈 목록이면 빈 목록 문장이다", async () => {
    const container = await page({ ok: true, releases: [], truncated: false });
    expect(main(container).querySelectorAll("section > h1")).toHaveLength(0);
    expect(main(container).textContent).toContain("No releases have been published yet.");
    expect(releasesLinks(main(container))).toHaveLength(2);
  });

  it("한 요청 상한에 닿았으면 목록 끝에 Older releases 문장이 선다", async () => {
    const container = await page({ ok: true, releases: TWO, truncated: true });
    const paragraphs = [...main(container).querySelectorAll("p")];
    expect(paragraphs.at(-1)?.textContent).toBe("Older releases are on GitHub Releases.");
    expectExternal(releasesLinks(main(container)));
  });

  it("원 배열이 상한인데 거른 뒤 0건이어도 Older releases 문장이 선다", async () => {
    const container = await page({ ok: true, releases: [], truncated: true });
    const paragraphs = [...main(container).querySelectorAll("p")];
    expect(main(container).textContent).toContain("No releases have been published yet.");
    expect(paragraphs.at(-1)?.textContent).toBe("Older releases are on GitHub Releases.");
  });

  it("상한 아래면 Older releases 문장이 없다", async () => {
    const container = await page({ ok: true, releases: TWO, truncated: false });
    expect(main(container).textContent).not.toContain("Older releases");
  });
});
