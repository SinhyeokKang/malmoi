import type { DeploymentMode } from "@/lib/deployment/mode";
import { routes } from "@/lib/routes";
import { en } from "@/messages/en";

import { SITE_ORIGIN } from "./site";

/**
 * **에이전트가 읽는 404 본문** (agent-readiness design §2.4) — HTML 오류 화면은 에이전트가 못 읽는다. 영어 고정 표면이다.
 *
 * ⚠️ **hosted 밖에서는 hosted를 가리키지 않는다** — self-hosted에서 `llms.txt`는 middleware가 404로 내고(`pageResponse`), hosted origin을
 * 실으면 설치가 남의 것을 자기 것인 양 말한다. 그래서 상대 링크만 싣는다 — Host 헤더를 읽지 않고 요청 URL 기준으로 풀린다.
 * 무효 모드도 같다(`public-response.ts`의 "모르면 숨긴다").
 */

const OPENAPI_PATH = "/openapi.json";

export function markdownNotFound(mode: DeploymentMode): string {
  const hosted = mode.kind === "hosted";
  const at = (path: string) => (hosted ? `${SITE_ORIGIN}${path}` : path);
  const items = [
    `- [${en.publicDocs.docs.title}](${at(routes.docs())})`,
    ...(hosted ? [`- [${en.seo.agentNotFound.llms}](${at("/llms.txt")})`] : []),
    `- [${en.seo.agentNotFound.openapi}](${at(OPENAPI_PATH)})`,
  ];
  return [`# ${en.notFound.title}`, "", en.seo.agentNotFound.body, "", ...items, ""].join("\n");
}

/** `error`는 기존 API 오류의 kebab 코드 키를 잇는다(`/api/push`의 `"unauthorized"`). 필드 `openapi`는 `/docs` 가이드와 겹치지 않는 이름이다. */
export function apiNotFoundBody(): { error: "not-found"; message: string; openapi: string } {
  return { error: "not-found", message: en.seo.apiNotFound, openapi: OPENAPI_PATH };
}
