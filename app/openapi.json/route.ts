import { appVersion } from "@/lib/app-version";
import { openApiDocument } from "@/lib/openapi/document";

/**
 * `/openapi.json` — CI push API의 OpenAPI 3.1 문서(agent-readiness design §2.3). **인가가 없다** — 이미 공개된 외부 계약(`docs/ACTIONS.md`)의
 * 기계 판독본이다(`entry-points.test.ts`의 `EXEMPT`).
 *
 * `force-static`이다 — 서버 URL이 상대 `/`라 모드 분기가 없고, `lib/push/plan.ts` → 어댑터 → ts-morph로 이어지는 무거운 그래프가
 * 빌드 때만 평가된다.
 */
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json(openApiDocument(appVersion()));
}
