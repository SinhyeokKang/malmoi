import { loadPage, loadSummary } from "@/lib/guide/load";
import { docsSearchEntries } from "@/lib/search/docs-index";

// 공개 가이드만 빌드 때 읽는다. 실패를 삼키면 배포가 빈 색인을 성공으로 캐시한다.
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json({ docs: docsSearchEntries(loadSummary(), loadPage) });
}
