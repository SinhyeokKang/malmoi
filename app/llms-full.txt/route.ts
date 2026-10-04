import { loadSource, loadSummary } from "@/lib/guide/load";
import { flattenNav } from "@/lib/guide/summary";
import { llmsFull } from "@/lib/seo/llms";

/**
 * `/llms-full.txt` — 가이드 원고 전문(seo-geo spec D5). **인가가 없다** — 이미 공개된 `/docs` 원고만 낸다(`entry-points.test.ts`의 `EXEMPT`).
 *
 * ⚠️ **`force-static`이 전제다** — `/llms.txt`와 같은 이유(파일 트레이싱이 `guide/`를 이 라우트에 싣지 않는다).
 */
export const dynamic = "force-static";

export function GET(): Response {
  // 크롤러는 쿠키가 없다 — 원문 en만 낸다(ui-locales design §6.1)
  const flat = flattenNav(loadSummary("en"));
  const sources = new Map(flat.map((item) => [item.file, loadSource("en", item.file)]));
  return new Response(llmsFull(flat, sources), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
