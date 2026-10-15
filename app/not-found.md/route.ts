import { deploymentMode } from "@/lib/deployment/mode";
import { markdownNotFound } from "@/lib/seo/agent-errors";

/**
 * **어떤 라우트에도 매칭되지 않는 경로 + `Accept`에 `text/markdown`** — `next.config.ts`의 fallback rewrite가 여기로 보낸다
 * (ARCHITECTURE §8.1). 직접 요청해도 늘 404라 거짓이 없다. **인가가 없다** — 공개 문서 링크만 낸다(`entry-points.test.ts`의 `EXEMPT`).
 *
 * ⚠️ **`force-dynamic`이다** — 본문이 배포 모드로 갈리는데 모드는 런타임 env다(같은 이미지가 self-hosted로 돈다). `force-static`이면
 * 빌드 시점 모드로 굳는다.
 * ⚠️ **모든 메서드를 같은 핸들러로 낸다** — rewrite는 메서드를 가리지 않아 GET만 두면 미존재 경로 POST가 405다(§0 실측).
 * `no-store`라 공유 캐시에 남지 않고, `Vary: Accept`가 같은 경로의 HTML 404와 섞이지 않게 한다.
 */
export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response(markdownNotFound(deploymentMode()), {
    status: 404,
    headers: { "content-type": "text/markdown; charset=utf-8", vary: "Accept", "cache-control": "no-store" },
  });
}

export { notFound as DELETE, notFound as GET, notFound as HEAD, notFound as OPTIONS, notFound as PATCH, notFound as POST, notFound as PUT };
