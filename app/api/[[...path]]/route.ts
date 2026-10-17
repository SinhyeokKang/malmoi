import { apiNotFoundBody } from "@/lib/seo/agent-errors";

/**
 * **어떤 route도 받지 않는 `/api` 경로의 JSON 404** (ARCHITECTURE §8.1) — Next 기본은 HTML 404라 API 호출자가 못 읽는다.
 * 선택적 catch-all이라 `/api` 자신도 받고, 정적·더 구체적인 세그먼트가 항상 이기므로 등록된 API는 무변경이다. **인가가 없다**.
 *
 * ⚠️ **`dynamicParams = false` route의 목록 밖 요청도 여기로 온다**(`/api/search-index/fr`) — 그 route가 `NoFallbackError`를 던지면 라우터가
 * 다음 후보로 다시 라우팅한다. 바라는 결과다.
 * ⚠️ **`app/api` 바로 아래에 동적 세그먼트·`route.ts`를 만들지 않는다** — 이 catch-all과 형제 충돌이 된다.
 */
function notFound(): Response {
  return Response.json(apiNotFoundBody(), { status: 404 });
}

export { notFound as DELETE, notFound as GET, notFound as HEAD, notFound as OPTIONS, notFound as PATCH, notFound as POST, notFound as PUT };
