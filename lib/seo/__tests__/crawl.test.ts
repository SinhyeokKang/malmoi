import { describe, expect, it } from "vitest";

import { loadSummary } from "@/lib/guide/load";
import { flattenNav } from "@/lib/guide/summary";

import { robotsFor, sitemapEntries } from "../crawl";
import { SITE_ORIGIN } from "../site";

/**
 * **크롤러용 파일 둘의 판정** (seo-geo T1). robots는 요청 시점 `VERCEL_ENV`로 갈리고(spec D11), sitemap은 실물 SUMMARY에서 온다 —
 * 원고가 움직이면 기대값도 같이 움직이도록 파생값만 단언한다.
 */
describe("robotsFor — 프로덕션만 연다", () => {
  it("`production`은 전체 허용 + 앱·API 거부 + sitemap 위치", () => {
    expect(robotsFor("production")).toEqual({
      rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/projects", "/account", "/preferences", "/inbox"] }],
      sitemap: "https://mal-moi.com/sitemap.xml",
    });
  });

  // ⚠️ 모르면 숨긴다 — `lib/security-headers.ts`와 반대 방향의 fail-closed다.
  it.each(["preview", "development", undefined, "weird", "Production", ""])("`%s`는 `Disallow: /` 하나", (env) => {
    expect(robotsFor(env)).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
  });

  it("noindex 셋(`/invite`·`/signin`)은 robots로 막지 않는다 — 막으면 noindex를 못 보고 URL만 색인된다", () => {
    const rules = robotsFor("production").rules;
    const disallow = (Array.isArray(rules) ? rules : [rules]).flatMap((rule) => rule.disallow ?? []);
    expect(disallow.some((path) => path.startsWith("/invite") || path.startsWith("/signin"))).toBe(false);
  });
});

describe("sitemapEntries — `/` · docs 전부 · `/changelog` · `/privacy`", () => {
  const flat = flattenNav(loadSummary("en"));

  it("항목 수가 SUMMARY 전부 + 3이고 SUMMARY 순서다 — `/changelog`는 `/privacy` 앞", () => {
    const urls = sitemapEntries(flat).map((entry) => entry.url);
    expect(urls).toHaveLength(flat.length + 3);
    expect(urls[0]).toBe(`${SITE_ORIGIN}/`);
    expect(urls.at(-1)).toBe(`${SITE_ORIGIN}/privacy`);
    expect(urls.at(-2)).toBe(`${SITE_ORIGIN}/changelog`);
    expect(urls.slice(1, -2)).toEqual(flat.map((item) => `${SITE_ORIGIN}/docs${item.slug.map((part) => `/${part}`).join("")}`));
  });

  it("개요는 끝 `/` 없는 `/docs`이고, 중첩 장이 부모 뒤에 온다", () => {
    const urls = sitemapEntries(flat).map((entry) => entry.url);
    expect(urls).toContain("https://mal-moi.com/docs");
    expect(urls.filter((url) => url.endsWith("/"))).toEqual(["https://mal-moi.com/"]);
    expect(urls.indexOf("https://mal-moi.com/docs/setup")).toBeLessThan(urls.indexOf("https://mal-moi.com/docs/setup/create-project"));
  });

  it("`/signin`이 없고 `lastModified`를 싣지 않는다 — 빌드 시각이면 매 배포 전부 바뀜이 된다", () => {
    const entries = sitemapEntries(flat);
    expect(entries.some((entry) => entry.url.includes("/signin"))).toBe(false);
    expect(entries.every((entry) => !("lastModified" in entry))).toBe(true);
  });

  it("두 번 불러도 같다", () => {
    expect(sitemapEntries(flat)).toStrictEqual(sitemapEntries(flat));
  });
});
