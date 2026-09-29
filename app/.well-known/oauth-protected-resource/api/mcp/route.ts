import { NextResponse } from "next/server";

import { oauthEndpoint } from "@/lib/oauth/endpoint";
import { protectedResourceMetadata } from "@/lib/oauth/metadata";

/**
 * **RFC 9728 Protected Resource Metadata** — `/api/mcp`의 발견 문서 (mcp-oauth design §1). `/api/mcp` 401의 `WWW-Authenticate`가 이 URL을
 * 가리키고(Claude Code), Codex는 헤더 없이 같은 경로를 추측한다(T1 실측). 외부 계약이라 Route Handler다.
 *
 * ⚠️ **요청 origin의 문서다** — dev·preview·prod가 각자 자기를 광고한다(`oauthEndpoint`가 허용 호스트로 거른다). 허용 밖이면 404다.
 * ⚠️ DB도 쿠키도 읽지 않는다 — 무인증 공개 문서다(`lib/mcp/__tests__/no-cookie-reads.test.ts`가 센다).
 */
export function GET(request: Request): Response {
  const endpoint = oauthEndpoint(request.headers);
  if (endpoint === null) return NextResponse.json({ error: "not-found" }, { status: 404 });
  try {
    return NextResponse.json(protectedResourceMetadata(endpoint.issuer));
  } catch {
    // SDK 빌더가 issuer를 검사한다(HTTPS, localhost만 예외) — 프록시가 `x-forwarded-proto`를 안 준 허용 호스트의 `http://` origin이 여기 온다.
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
}
