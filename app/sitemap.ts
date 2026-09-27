import type { MetadataRoute } from "next";

import { loadSummary } from "@/lib/guide/load";
import { flattenNav } from "@/lib/guide/summary";
import { sitemapEntries } from "@/lib/seo/crawl";

/**
 * ⚠️ **빌드 때 prerender되는 것이 전제다** — `outputFileTracingIncludes`가 `guide/`를 `/docs/[[...slug]]` 함수에만 싣는다
 * (`next.config.ts`). 동적 API를 쓰거나 `force-dynamic`을 붙이면 Vercel에서만 SUMMARY를 못 읽어 500이 된다(로컬 `next start`는
 * 리포 파일을 그대로 읽어 못 잡는다).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(flattenNav(loadSummary()));
}
