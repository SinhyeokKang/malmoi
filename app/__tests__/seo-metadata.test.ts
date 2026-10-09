import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";

import nextConfig from "../../next.config";
import { loadPage, loadSummary } from "@/lib/guide/load";
import { leadParagraph } from "@/lib/guide/sections";
import { flattenNav } from "@/lib/guide/summary";
import { en } from "@/messages/en";
import { OG_IMAGE } from "@/lib/seo/site";

/**
 * **머리(head)의 배선** (seo-geo T6). 값의 조립은 `lib/seo/__tests__/site.test.ts`가 들고, 여기는 어느 페이지가 무엇을 내는지 본다.
 *
 * ⚠️ **canonical은 공개 페이지에만 있다** — 루트에 두면 얕은 병합으로 자기 `alternates`가 없는 페이지(앱·`/signin`·`/invite`·404)
 * 전부에 홈 canonical이 번진다(noindex + 홈 canonical 모순, 404의 soft-404 신호).
 */
vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn() }));
vi.mock("@/app/invite/actions", () => ({ acceptInvitation: vi.fn() }));
// 요청의 화면 언어를 ko로 둔다 — `/docs` 메타는 그래도 en 원고여야 한다(크롤러는 쿠키가 없고 URL이 언어와 무관하다, ui-locales design §6.1).
// 지금은 `generateMetadata`가 화면 언어를 묻지 않아 참이다 — 누가 넣으면 아래 SUMMARY 전 항목 단언이 ko 제목으로 red가 된다.
vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "ko", getMessages: async () => (await import("@/messages/en")).en }));
// next/font는 Next 빌드가 변환한다. 여기서는 SEO 값만 읽고 실제 로더·글리프는 font-loading.test.ts가 검사한다.
vi.mock("next/font/local", () => ({
  default: () => ({ className: "geist-font-fixture", variable: "geist-variable-fixture", style: { fontFamily: "Geist" } }),
}));

type DocsMeta = (props: { params: Promise<{ slug?: string[] }> }) => Promise<Metadata>;
async function docsMetadata(slug: string[] | undefined): Promise<Metadata> {
  const { generateMetadata } = (await import("@/app/docs/[[...slug]]/page")) as unknown as { generateMetadata: DocsMeta };
  return generateMetadata({ params: Promise.resolve(slug === undefined ? {} : { slug }) });
}

const NOINDEX = { index: false, follow: false };

describe("루트 레이아웃", () => {
  it("metadataBase · 제목 템플릿 · 기본 OG — canonical·og:url은 없다", async () => {
    vi.stubEnv("MALMOI_ORIGIN", "");
    const metadata = await (await import("@/app/layout")).generateMetadata();
    vi.unstubAllEnvs();
    expect(String(metadata.metadataBase)).toBe("https://mal-moi.com/");
    expect(metadata.title).toEqual({ default: "Malmoi", template: "%s · Malmoi" });
    expect(metadata.description).toBe(en.landing.hero.body);
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).toEqual({ siteName: "Malmoi", locale: "en_US", type: "website", images: [OG_IMAGE] });
    expect((metadata.openGraph as { url?: unknown }).url).toBeUndefined();
    expect(metadata.twitter).toEqual({ card: "summary_large_image", images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }] });
    expect(metadata.robots).toBeUndefined();
  });

  it("self-hosted의 metadataBase는 설치 origin이다 — 나머지 머리는 같다", async () => {
    const { generateMetadata } = await import("@/app/layout");
    vi.stubEnv("MALMOI_ORIGIN", "");
    const hosted = await generateMetadata();
    vi.stubEnv("MALMOI_ORIGIN", "https://malmoi.example.com");
    vi.stubEnv("VERCEL_ENV", "");
    const self = await generateMetadata();
    vi.unstubAllEnvs();
    expect(String(self.metadataBase)).toBe("https://malmoi.example.com/");
    expect({ ...self, metadataBase: null }).toEqual({ ...hosted, metadataBase: null });
  });
});

describe("공개 페이지 — canonical 있음 · noindex 없음", () => {
  it("`/` — 제목 absolute · 설명 hero.body · canonical 홈", async () => {
    const { metadata } = await import("@/app/page");
    expect(metadata.title).toEqual({ absolute: en.seo.homeTitle });
    expect(metadata.description).toBe(en.landing.hero.body);
    expect(metadata.alternates).toEqual({ canonical: "https://mal-moi.com/" });
    expect((metadata.openGraph as { title: string }).title).toBe(en.seo.homeTitle);
    expect(metadata.robots).toBeUndefined();
  });

  it("`/privacy` — `Privacy Policy`(템플릿이 `· Malmoi`를 붙인다) · canonical", async () => {
    const { metadata } = await import("@/app/privacy/page");
    expect(metadata.title).toBe(en.publicDocs.privacy.title);
    expect(metadata.alternates).toEqual({ canonical: "https://mal-moi.com/privacy" });
    expect(metadata.robots).toBeUndefined();
  });

  it("docs 레이아웃 — `Malmoi Docs` 템플릿", async () => {
    const { metadata } = await import("@/app/docs/layout");
    expect(metadata.title).toEqual({ default: "Malmoi Docs", template: "%s · Malmoi Docs" });
  });

  it("`/docs` 개요 — absolute `Malmoi Docs` · canonical 끝 `/` 없음", async () => {
    const meta = await docsMetadata(undefined);
    expect(meta.title).toEqual({ absolute: "Malmoi Docs" });
    expect(meta.alternates).toEqual({ canonical: "https://mal-moi.com/docs" });
    expect((meta.openGraph as { title: string }).title).toBe("Malmoi Docs");
  });

  it("SUMMARY 전 항목 — 제목은 en SUMMARY 제목 · 설명은 en 첫 문단(없으면 hero.body) · canonical 절대 URL — 화면 언어가 ko여도", async () => {
    const flat = flattenNav(loadSummary("en")).filter((item) => item.slug.length > 0);
    expect(flat.length).toBeGreaterThan(10);
    for (const item of flat) {
      const meta = await docsMetadata(item.slug);
      expect(meta.title).toBe(item.title);
      expect(meta.description).toBe(leadParagraph(loadPage("en", item.file)) ?? en.landing.hero.body);
      expect(meta.alternates).toEqual({ canonical: `https://mal-moi.com/docs/${item.slug.join("/")}` });
      expect((meta.openGraph as { images: unknown[] }).images).toEqual([OG_IMAGE]);
      expect(meta.robots).toBeUndefined();
    }
  });

  it("없는 slug — 404 제목 · canonical 없음", async () => {
    const meta = await docsMetadata(["no-such-page"]);
    expect(meta.title).toBe(en.publicDocs.docs.notFound.title);
    expect(meta.alternates).toBeUndefined();
    expect(meta.openGraph).toBeUndefined();
  });
});

describe("색인 거부 셋 — canonical 없음", () => {
  it("`/invite/<token>` — noindex · no-referrer", async () => {
    const { metadata } = await import("@/app/invite/[token]/page");
    expect(metadata).toEqual({ title: en.invite.title, robots: NOINDEX, referrer: "no-referrer" });
  });

  it("`/signin/link/<challenge>` — noindex · no-referrer", async () => {
    const { metadata } = await import("@/app/signin/link/[challenge]/page");
    expect(metadata).toEqual({ title: en.link.title, robots: NOINDEX, referrer: "no-referrer" });
  });

  it("`/signin` — noindex (referrer는 기본값)", async () => {
    const { metadata } = await import("@/app/signin/page");
    expect(metadata).toEqual({ title: en.seo.signInTitle, robots: NOINDEX });
  });

  it("루트 404 — 화면 h1 값 · canonical 없음", async () => {
    const { metadata } = await import("@/app/not-found");
    expect(metadata).toEqual({ title: en.notFound.title });
  });
});

describe("next.config — 스트리밍 metadata를 전 UA에서 끈다", () => {
  // AI 봇(GPTBot·ClaudeBot·PerplexityBot)이 Next의 HTML-limited 목록 밖이라, 켜 두면 `<title>`·canonical이 `<body>` 끝에 붙는다.
  it("`htmlLimitedBots`가 모든 UA에 맞는다", () => {
    const bots = nextConfig.htmlLimitedBots;
    expect(bots).toBeInstanceOf(RegExp);
    for (const ua of ["GPTBot/1.0", "ClaudeBot", "Mozilla/5.0 (Macintosh)", ""]) expect(bots!.test(ua)).toBe(true);
  });
});
