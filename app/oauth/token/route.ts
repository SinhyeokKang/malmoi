import "server-only";

import { NextResponse } from "next/server";

import { readBoundedText } from "@/lib/bounded-body";
import { getPrisma } from "@/lib/db";
import { logFailure } from "@/lib/github-connect/log";
import { oauthEndpoint } from "@/lib/oauth/endpoint";
import { parseTokenRequest } from "@/lib/oauth/token-request";
import { tokenResponse } from "@/lib/oauth/tokens";
import { exchangeAuthorizationCode, refreshConnection, type GrantResult } from "@/lib/oauth-server/token";

/**
 * **OAuth 토큰 엔드포인트** — `POST /oauth/token` (mcp-oauth design §1 · §4.1 · §4.2). MCP 클라이언트가 code(+PKCE)·refresh로 부른다.
 * 외부 계약이라 Route Handler다(CLAUDE.md). 세션 인가가 없다 — 제출된 자격증명이 인가이고 코어가 잠금 뒤 다시 읽는다.
 *
 * ⚠️ **쿠키를 읽지 않는다**(`no-cookie-reads.test.ts`) — public client만 받으므로 클라이언트 인증도 없다(`token_endpoint_auth_methods: none`).
 * ⚠️ **DB 장애는 `server_error` 500이다** — `invalid_grant`로 접으면 클라이언트가 연결을 버리고 재로그인을 시킨다(design §5).
 * 응답은 전부 `Cache-Control: no-store`(RFC 6749 §5.1).
 */

/** form 본문 하나 — T1에서 두 CLI의 본문은 300바이트 안팎이었다. */
const MAX_BODY_BYTES = 8_192;
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

const error = (code: string, status: number) => NextResponse.json({ error: code }, { status, headers: NO_STORE });

export async function POST(request: Request): Promise<Response> {
  // 발급 환경을 정할 수 없는 호스트는 받지 않는다 — code·연결이 그 issuer/resource에 묶인다.
  const endpoint = oauthEndpoint(request.headers);
  if (endpoint === null) return error("invalid_request", 400);
  const text = await readBoundedText(request, MAX_BODY_BYTES);
  if (text === null) return error("invalid_request", 400);
  const parsed = parseTokenRequest(request.headers.get("content-type"), text);
  if (!parsed.ok) return error(parsed.error, 400);

  const now = new Date();
  let result: GrantResult;
  try {
    const { request: grant } = parsed;
    result = grant.grantType === "authorization_code"
      ? await exchangeAuthorizationCode(getPrisma(), grant, endpoint, now)
      : await refreshConnection(getPrisma(), grant, endpoint, now);
  } catch (failure) {
    logFailure("oauth-token", failure);
    return error("server_error", 500);
  }
  if (result.status !== "ok") return error("invalid_grant", 400);
  return NextResponse.json(tokenResponse(result.tokens, now), { headers: NO_STORE });
}
