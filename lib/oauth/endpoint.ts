import { requestOrigin } from "@/lib/github-connect/origin";

import { mcpResource } from "./metadata";

/**
 * 현재 요청의 발급 환경 (mcp-oauth design §6). issuer와 resource가 **같은 origin 판정 하나**에서 나온다 — 따로 만들면 한쪽만 바뀐다.
 * origin은 `requestOrigin`이 허용 호스트로 거른 값이라 dev·preview·prod가 각자 자기를 광고하고, 조작된 `Host`로 남의 호스트를 광고하지 않는다.
 * 허용 밖이면 `null` — 그 요청에는 OAuth 바인딩이 성립하지 않는다(문서 404 · access 거부 · 토큰 엔드포인트 거부).
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */
export type OAuthEndpoint = { issuer: string; resource: string };

export function oauthEndpoint(headers: Headers): OAuthEndpoint | null {
  const origin = requestOrigin({ host: headers.get("host"), forwardedProto: headers.get("x-forwarded-proto") })?.origin;
  return origin === undefined ? null : { issuer: origin, resource: mcpResource(origin) };
}
