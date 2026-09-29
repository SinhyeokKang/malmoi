import "server-only";

import { NextResponse } from "next/server";

import { readBoundedText } from "@/lib/bounded-body";
import { getPrisma } from "@/lib/db";
import { logFailure } from "@/lib/github-connect/log";
import { oauthEndpoint } from "@/lib/oauth/endpoint";
import { parseRevokeRequest } from "@/lib/oauth/token-request";
import { revokeToken } from "@/lib/oauth-server/revoke";

/**
 * **OAuth 폐기 엔드포인트** — `POST /oauth/revoke` (RFC 7009 · mcp-oauth design §4.2 · §6). Claude Code가 재인증 때 옛 refresh·access를
 * 각각 부른다(T1 실측). 모르는 토큰도 200이다(§2.2 — 응답이 토큰의 존재를 말하지 않는다). 현재 issuer와 제출한 `client_id`에 묶인 연결만 끊는다.
 *
 * ⚠️ 쿠키를 읽지 않는다. ⚠️ DB 장애는 500 `server_error`다 — 끊지 못했는데 200이면 클라이언트는 옛 토큰이 죽었다고 믿는다.
 */
const MAX_BODY_BYTES = 8_192;

export async function POST(request: Request): Promise<Response> {
  const endpoint = oauthEndpoint(request.headers);
  const text = endpoint === null ? null : await readBoundedText(request, MAX_BODY_BYTES);
  const parsed = text === null ? null : parseRevokeRequest(request.headers.get("content-type"), text);
  if (endpoint === null || parsed === null || !parsed.ok) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    await revokeToken(getPrisma(), { token: parsed.token, clientId: parsed.clientId }, endpoint);
  } catch (failure) {
    logFailure("oauth-revoke", failure);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  return new Response(null, { status: 200 });
}
