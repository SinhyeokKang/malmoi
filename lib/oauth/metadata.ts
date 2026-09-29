import { buildOAuthProtectedResourceMetadata, getOAuthProtectedResourceMetadataUrl, type OAuthMetadata, type OAuthProtectedResourceMetadata } from "@modelcontextprotocol/server";

/**
 * 발견 문서 둘과 401 헤더 (mcp-oauth design §3). 입력은 `requestOrigin`이 허용 호스트로 거른 origin 하나다 — dev·preview·prod가
 * 각자 자기 origin을 광고한다(design §6). 같은 origin → 언제나 같은 문서.
 *
 * ⚠️ issuer = origin이다(경로 없음) — RFC 8414 발견 URL이 `/.well-known/oauth-authorization-server` 그대로가 된다.
 * ⚠️ `scopes_supported`를 싣지 않는다 — OAuth scope로 새 권한을 만들지 않는다(spec 비목표).
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 조립이다.
 */

/** 발급 환경의 정확한 MCP URL — 요청·code·연결의 `resource`로 보관된다. */
export function mcpResource(origin: string): string {
  return `${origin}/api/mcp`;
}

export function authorizationServerMetadata(origin: string): OAuthMetadata {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    // public client뿐이다 — 클라이언트 시크릿을 발급하지 않는다(spec 비목표).
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
  };
}

/** SDK 빌더가 issuer를 검사한다(HTTPS, localhost·127.0.0.1만 예외) — 허용 호스트 밖 origin은 여기까지 오지 않는다. */
export function protectedResourceMetadata(origin: string): OAuthProtectedResourceMetadata {
  return buildOAuthProtectedResourceMetadata({ oauthMetadata: authorizationServerMetadata(origin), resourceServerUrl: new URL(mcpResource(origin)) });
}

export function wwwAuthenticate(origin: string): string {
  return `Bearer resource_metadata="${getOAuthProtectedResourceMetadataUrl(new URL(mcpResource(origin)))}"`;
}
