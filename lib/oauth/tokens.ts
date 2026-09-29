import { randomBytes } from "node:crypto";

import { OAUTH_ACCESS_PREFIX, OAUTH_REFRESH_PREFIX } from "./bearer";

/**
 * Malmoi가 발급하는 OAuth 원문과 수명 (mcp-oauth design §4 · 결정 기록). **원문은 저장하지 않는다** — 응답(토큰)·콜백 URL(code)·authorize URL
 * (요청 id)에만 있고 DB에는 해시다(`hashApiToken` — 개인 토큰·초대와 같은 함수). 요청 id는 비밀이 아니라 추측 불가 식별자라 원문 그대로 키다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 테스트가 직접 import하는 순수 모듈이다(`lib/mcp/token.ts`와 같다).
 */

/** access는 짧다 — 권한은 매 호출 DB에서 읽지만, 새어 나간 access가 쓰이는 창을 refresh 주기로 줄인다. */
export const ACCESS_TOKEN_TTL_MS = 3_600_000;
/** code는 발급 시점 + 60초 — 요청 TTL과 독립이다(spec 조건 6). */
export const AUTHORIZATION_CODE_TTL_MS = 60_000;
/** 로그인 왕복(공급자 · 계정 연결 challenge) 동안 요청을 들고 있는 시간. */
export const AUTHORIZATION_REQUEST_TTL_MS = 600_000;

const random = () => randomBytes(32).toString("base64url");

export const generateAccessToken = (): string => `${OAUTH_ACCESS_PREFIX}${random()}`;
export const generateRefreshToken = (): string => `${OAUTH_REFRESH_PREFIX}${random()}`;
export const generateAuthorizationCode = (): string => random();
export const generateRequestId = (): string => random();

/** access는 연결 수명을 넘지 않는다 — 연결이 끝난 뒤에 살아 있는 access가 없게. */
export function accessExpiry(now: Date, connectionExpiresAt: Date): Date {
  return new Date(Math.min(now.getTime() + ACCESS_TOKEN_TTL_MS, connectionExpiresAt.getTime()));
}

export type IssuedTokens = { accessToken: string; refreshToken: string; accessExpiresAt: Date };

/** RFC 6749 §5.1. `scope`를 싣지 않는다 — OAuth scope로 권한을 말하지 않는다(spec 비목표). */
export function tokenResponse(tokens: IssuedTokens, now: Date) {
  return {
    access_token: tokens.accessToken,
    token_type: "Bearer" as const,
    expires_in: Math.floor((tokens.accessExpiresAt.getTime() - now.getTime()) / 1000),
    refresh_token: tokens.refreshToken,
  };
}
