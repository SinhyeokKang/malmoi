import { loadPage, loadSummary } from "@/lib/guide/load";
import { leadParagraph } from "@/lib/guide/sections";
import { flattenNav } from "@/lib/guide/summary";
import { llmsIndex } from "@/lib/seo/llms";

/**
 * `/llms.txt` — 가이드 목차(llmstxt.org). **인가가 없다** — 이미 공개된 `/docs` 원고만 낸다(`entry-points.test.ts`의 `EXEMPT`).
 *
 * ⚠️ **`force-static`이 전제다** — `outputFileTracingIncludes`가 `guide/`를 `/docs/[[...slug]]` 함수에만 싣는다(`next.config.ts`).
 * 빼거나 동적 API를 쓰면 Vercel에서만 SUMMARY를 못 읽어 500이 된다.
 */
export const dynamic = "force-static";

export function GET(): Response {
  const nav = loadSummary();
  const leads = new Map(flattenNav(nav).map((item) => [item.file, leadParagraph(loadPage(item.file))]));
  return new Response(llmsIndex(nav, leads), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
