import type { MetadataRoute } from "next";

import { docHref } from "@/lib/guide/href";
import type { FlatNavItem } from "@/lib/guide/summary";
import { routes } from "@/lib/routes";

import { SITE_ORIGIN } from "./site";

/**
 * `/robots.txt` — **`production`만 연다.** 모르는 값·`undefined`는 `Disallow: /`다 — `lib/security-headers.ts`와 반대 방향의
 * fail-closed다(그쪽은 모르면 프로덕션처럼 좁히고, 여기는 모르면 숨긴다).
 *
 * ⚠️ **`/invite`·`/signin`을 여기서 막지 않는다** — 막으면 크롤러가 페이지의 noindex를 못 보고 외부 링크만으로 URL이 색인된다
 * (토큰이 검색 결과에 뜬다). `/projects`·`/account`는 비로그인에게 302라 본문이 없으므로 여기서 거부하는 것이 맞다.
 */
export function robotsFor(vercelEnv: string | undefined): MetadataRoute.Robots {
  if (vercelEnv !== "production") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", routes.projects(), routes.account()] }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}

/**
 * `/sitemap.xml` — `/` · docs 전부(SUMMARY 순서) · `/changelog` · `/privacy`. `/signin`은 noindex라 넣지 않는다.
 *
 * ⚠️ **`lastModified`를 싣지 않는다** — 빌드 시각을 넣으면 매 배포가 "전부 바뀜"이 되어 신호가 무의미해진다.
 */
export function sitemapEntries(flat: readonly FlatNavItem[]): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_ORIGIN}/` },
    ...flat.map((item) => ({ url: `${SITE_ORIGIN}${docHref(item.slug)}` })),
    { url: `${SITE_ORIGIN}${routes.changelog()}` },
    { url: `${SITE_ORIGIN}${routes.privacy()}` },
  ];
}
