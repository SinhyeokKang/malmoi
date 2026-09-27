import { describe, expect, it } from "vitest";

import { docLd, jsonLdHtml, LANDING_LD } from "../json-ld";

/** **구조화 데이터** (seo-geo T3). `jsonLdHtml`이 `dangerouslySetInnerHTML`의 유일한 입력 경로다. */
describe("jsonLdHtml — 원고가 태그를 닫지 못한다", () => {
  const hostile = { headline: "</script><script>alert(1)</script>", body: "a\u2028b\u2029c & d > e" };

  it("`<`·`>`·`&`·U+2028·U+2029가 원문으로 남지 않는다", () => {
    const html = jsonLdHtml(hostile);
    expect(html).not.toMatch(/[<>&\u2028\u2029]/);
    expect(html).toContain("\\u003c/script\\u003e");
  });

  it("되읽으면 원래 값이다", () => {
    expect(JSON.parse(jsonLdHtml(hostile))).toEqual(hostile);
  });
});

describe("LANDING_LD", () => {
  const types = LANDING_LD.map((item) => item["@type"]);

  it("SoftwareApplication + Organization", () => {
    expect(types).toEqual(["SoftwareApplication", "Organization"]);
    for (const item of LANDING_LD) expect(item["@context"]).toBe("https://schema.org");
  });

  it("평점·리뷰가 없다 — 없는 데이터다", () => {
    const text = JSON.stringify(LANDING_LD);
    expect(text).not.toContain("aggregateRating");
    expect(text).not.toContain("review");
  });

  it("무료 — 과금이 비범위다", () => {
    const app = LANDING_LD[0] as unknown as { offers: { price: string; priceCurrency: string } };
    expect(app.offers).toMatchObject({ price: "0", priceCurrency: "USD" });
  });
});

describe("docLd — TechArticle + BreadcrumbList", () => {
  const page = { title: "Create a project", description: "Connect.", url: "https://mal-moi.com/docs/setup/create-project" };
  const chapter = { title: "Set up a project", url: "https://mal-moi.com/docs/setup" };

  type Crumb = { "@type": string; position: number; name: string; item: string };
  const crumbs = (ld: ReturnType<typeof docLd>): Crumb[] =>
    (ld.find((item) => item["@type"] === "BreadcrumbList") as unknown as { itemListElement: Crumb[] }).itemListElement;

  it("장 아래 페이지는 Docs › 장 › 페이지 — position이 1부터 연속", () => {
    const ld = docLd({ ...page, chapter });
    expect(ld.map((item) => item["@type"])).toEqual(["TechArticle", "BreadcrumbList"]);
    expect(crumbs(ld)).toEqual([
      { "@type": "ListItem", position: 1, name: "Docs", item: "https://mal-moi.com/docs" },
      { "@type": "ListItem", position: 2, name: chapter.title, item: chapter.url },
      { "@type": "ListItem", position: 3, name: page.title, item: page.url },
    ]);
  });

  it("장 개요(장 없음)는 2항목", () => {
    expect(crumbs(docLd({ ...page, chapter: null })).map((crumb) => crumb.position)).toEqual([1, 2]);
  });

  it("TechArticle이 제목·설명·URL을 든다", () => {
    expect(docLd({ ...page, chapter })[0]).toMatchObject({
      "@context": "https://schema.org",
      headline: page.title,
      description: page.description,
      url: page.url,
    });
  });
});
