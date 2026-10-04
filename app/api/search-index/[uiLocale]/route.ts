import { guideLocales, loadPage, loadSummary } from "@/lib/guide/load";
import { parseUiLocale } from "@/lib/i18n/locales";
import { docsSearchEntries } from "@/lib/search/docs-index";

// 공개 가이드만 빌드 때 읽는다. 실패를 삼키면 배포가 빈 색인을 성공으로 캐시한다.
export const dynamic = "force-static";
// ⚠️ 언어가 URL에 실린다 — force-static은 쿠키로 갈라질 수 없다(ui-locales design §6.1). 목록 밖 값은 404다.
export const dynamicParams = false;

export function generateStaticParams(): { uiLocale: string }[] {
  return guideLocales().map((uiLocale) => ({ uiLocale }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ uiLocale: string }> }): Promise<Response> {
  const uiLocale = parseUiLocale((await params).uiLocale);
  if (uiLocale === null) return new Response(null, { status: 404 });
  return Response.json({ docs: docsSearchEntries(loadSummary(uiLocale), (file) => loadPage(uiLocale, file)) });
}
