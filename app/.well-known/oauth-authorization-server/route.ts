import { NextResponse } from "next/server";

import { oauthEndpoint } from "@/lib/oauth/endpoint";
import { authorizationServerMetadata } from "@/lib/oauth/metadata";

/**
 * **RFC 8414 Authorization Server Metadata** (mcp-oauth design §1). issuer = origin(경로 없음)이라 발견 URL이 이 루트 경로 그대로다 —
 * 두 CLI 모두 여기를 읽었다(T1 실측). 등록은 CIMD뿐이라 `registration_endpoint`가 없다(design §2 "T1 판정").
 *
 * ⚠️ 요청 origin의 문서이고 허용 밖 호스트는 404다. DB도 쿠키도 읽지 않는다.
 */
export function GET(request: Request): Response {
  const endpoint = oauthEndpoint(request.headers);
  if (endpoint === null) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return NextResponse.json(authorizationServerMetadata(endpoint.issuer));
}
