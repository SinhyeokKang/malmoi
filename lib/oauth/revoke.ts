import { hashApiToken } from "@/lib/mcp/token";

import { OAUTH_ACCESS_PREFIX, OAUTH_REFRESH_PREFIX } from "./bearer";
import type { OAuthEndpoint } from "./endpoint";

/**
 * `/oauth/revoke` 판정 (RFC 7009 · mcp-oauth design §4.2 · §6). access·refresh 어느 쪽이 와도 **그 연결**을 끊는다 — 연결이 두 토큰의 단위다.
 * 모르는 토큰·안 맞는 바인딩은 무시다(RFC 7009 §2.2 — 응답은 같은 200이고 토큰의 존재를 말하지 않는다).
 *
 * ⚠️ `client_id`는 공개 식별자라 인증이 아니다 — 대조의 목적은 다른 클라이언트·다른 환경의 요청이 남의 연결을 끊지 못하게 하는 것뿐이다.
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */
export function revokeLookup(token: string): { column: "accessTokenHash" | "refreshTokenHash"; hash: string } | null {
  if (token.startsWith(OAUTH_ACCESS_PREFIX) && token.length > OAUTH_ACCESS_PREFIX.length) return { column: "accessTokenHash", hash: hashApiToken(token) };
  if (token.startsWith(OAUTH_REFRESH_PREFIX) && token.length > OAUTH_REFRESH_PREFIX.length) return { column: "refreshTokenHash", hash: hashApiToken(token) };
  return null;
}

export type RevokeRow = { id: string; clientId: string; issuer: string; resource: string };

export function planRevoke(input: { row: RevokeRow | null; clientId: string; endpoint: OAuthEndpoint }): { status: "revoke"; connectionId: string } | { status: "ignore" } {
  const { row, endpoint } = input;
  if (row === null || row.clientId !== input.clientId || row.issuer !== endpoint.issuer || row.resource !== endpoint.resource) return { status: "ignore" };
  return { status: "revoke", connectionId: row.id };
}
