import { m } from "@/lib/i18n";
import { GITHUB_REPO_URL } from "@/lib/links";

import { SITE_ORIGIN } from "./site";

type Ld = Record<string, unknown> & { "@context": "https://schema.org"; "@type": string };

/**
 * `<script type="application/ld+json">`의 **유일한 입력 경로**(`dangerouslySetInnerHTML`). `<`·`>`·`&`·U+2028·U+2029를
 * `\uXXXX`로 바꿔 원고에 `</script>`가 들어와도 태그를 못 닫는다 — JSON으로 되읽으면 같은 값이다.
 */
export function jsonLdHtml(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * 랜딩의 구조화 데이터 — 인자가 없으니 상수다(seo-geo spec D13).
 *
 * ⚠️ **평점·리뷰 필드를 넣지 않는다** — 없는 데이터다. Rich Results Test의 경고는 받아들였다.
 * `offers.price: "0"`은 과금이 비범위(PRODUCT §4.2)라 참이다.
 */
export const LANDING_LD: readonly Ld[] = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: m.common.appName,
    url: `${SITE_ORIGIN}/`,
    description: m.landing.hero.body,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: m.common.appName,
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}/brand/malmoi-icon-black.svg`,
    sameAs: [GITHUB_REPO_URL],
  },
];

/**
 * docs 하위 페이지의 구조화 데이터 — `TechArticle` + `BreadcrumbList`(Docs › 장 › 페이지). 장이 없으면(장 개요·장 밖 페이지) 2항목.
 * **`/docs` 개요에는 싣지 않는다** — 1항목 breadcrumb는 무의미하다. 장 URL은 호출부가 만든다.
 */
export function docLd({
  title,
  description,
  url,
  chapter,
}: {
  title: string;
  description: string;
  url: string;
  chapter: { title: string; url: string } | null;
}): Ld[] {
  const trail = [{ name: m.publicDocs.docs.title, item: `${SITE_ORIGIN}/docs` }, ...(chapter ? [{ name: chapter.title, item: chapter.url }] : []), { name: title, item: url }];
  return [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: title,
      description,
      url,
      inLanguage: "en",
      publisher: { "@type": "Organization", name: m.common.appName, url: `${SITE_ORIGIN}/` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, ...crumb })),
    },
  ];
}
