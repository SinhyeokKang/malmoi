import { API_TOKEN_PREFIX } from "@/lib/mcp/token";

/**
 * Malmoi가 발급하는 OAuth 토큰 접두 (mcp-oauth design §7). 개인 토큰(`mlm_`)과 같은 Malmoi 신원이고 GitHub 자격증명이 아니다.
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */
export const OAUTH_ACCESS_PREFIX = "mlo_";
export const OAUTH_REFRESH_PREFIX = "mlr_";

export type BearerKind = "api-token" | "oauth";

/** **DB를 두드리기 전에** 가른다 — refresh·push 토큰을 Bearer로 잘못 붙인 설정이 조회를 일으키지 않는다. */
export function resolveBearerKind(token: string): BearerKind | null {
  if (token.startsWith(API_TOKEN_PREFIX) && token.length > API_TOKEN_PREFIX.length) return "api-token";
  if (token.startsWith(OAUTH_ACCESS_PREFIX) && token.length > OAUTH_ACCESS_PREFIX.length) return "oauth";
  return null;
}
