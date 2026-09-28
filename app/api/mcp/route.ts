import "server-only";

import { WebStandardStreamableHTTPServerTransport, createMcpHandler, isLegacyRequest, type AuthInfo, type McpHttpHandler } from "@modelcontextprotocol/server";
import { NextResponse } from "next/server";

import { readBoundedText } from "@/lib/bounded-body";
import { getPrisma } from "@/lib/db";
import { logFailure } from "@/lib/github-connect/log";
import { requestOrigin } from "@/lib/github-connect/origin";
import { checkOrigin } from "@/lib/mcp/http";
import { createMcpServer } from "@/lib/mcp/server";
import { parseBearer } from "@/lib/mcp/token";
import { resolveApiToken, type ApiTokenSubject } from "@/lib/mcp/token-store";

/**
 * **MCP 진입점** — `POST /api/mcp` (mcp-connector design §1.1 · §1.2). CLI·코딩 에이전트가 개인 토큰(Bearer)으로 부른다.
 * 외부 진입점이라 Route Handler다(CLAUDE.md — Server Action은 공개 계약이 아니다).
 *
 * 순서가 계약이다: **Origin → 인증 → 크기 → 파싱 → 디스패치.** 인증이 본문보다 먼저라 무효 토큰 하나로 본문을 읽히지 않는다.
 * ⚠️ **쿠키를 읽지 않는다** — CSRF 방어의 전부다(`lib/mcp/__tests__/no-cookie-reads.test.ts`가 센다).
 * `/api/*`는 middleware matcher 밖이라 CSP·로그인 리다이렉트가 안 걸린다 — JSON 진입점이라 그게 맞다.
 *
 * **두 개정을 받는다**(T1 실측): Claude Code는 2026-07-28, Codex는 2025 handshake다. SDK 기본 `legacy: "stateless"`는 2025 응답을
 * SSE로 내므로, `isLegacyRequest`로 갈라 2025 쪽은 요청마다 JSON 모드 전송으로 받는다. 세션 id는 어느 쪽도 발급하지 않는다.
 * GET·DELETE(2025 세션 조작)는 내보내지 않는다 — Next가 405로 답한다.
 */

export const maxDuration = 60;

/** 본문 상한. `set_translations` 100키가 넉넉히 든다 — 키당 값 상한이 따로 있다(`KEY_SAVE_LIMITS`). */
const MAX_BODY_BYTES = 1_048_576;

// ⚠️ 401 본문은 한 문장이다 — 없음·무효·만료·폐기를 가르지 않는다(spec 조건 4). Claude Code는 이 본문을 사용자에게 그대로 보인다.
const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

/** 주체를 SDK의 `authInfo`로 싣는다 — 원문 토큰은 싣지 않는다(`token` 자리에 해시). 2026-07-28 쪽 팩토리가 `extra`에서 되읽는다. */
function authInfoOf(subject: ApiTokenSubject, origin: string | null): AuthInfo {
  return { token: subject.tokenId, clientId: subject.userId, scopes: [...subject.grants], extra: { subject, origin } };
}

/** 도구가 브라우저로 보내는 링크의 origin — 허용 호스트만(`requestOrigin`). 조작된 `Host`로 남의 호스트 링크를 만들지 않는다. */
function originOf(request: Request): string | null {
  return requestOrigin({ host: request.headers.get("host"), forwardedProto: request.headers.get("x-forwarded-proto") })?.origin ?? null;
}

function subjectOf(info: AuthInfo | undefined): ApiTokenSubject {
  const subject = info?.extra?.subject;
  // route가 인증을 끝낸 요청만 넘기므로 없을 수 없다 — 없으면 배선이 틀린 것이고 조용히 익명으로 돌지 않는다.
  if (subject === undefined || subject === null || typeof subject !== "object") throw new Error("MCP request reached the server without a subject");
  return subject as ApiTokenSubject;
}

let modern: McpHttpHandler | null = null;
/** 모듈 한 벌 — 첫 요청에 만든다(최상위에서 만들면 import만으로 SDK가 경고를 찍고 인스턴스를 세운다). */
function modernHandler(): McpHttpHandler {
  modern ??= createMcpHandler(ctx => createMcpServer(subjectOf(ctx.authInfo), typeof ctx.authInfo?.extra?.origin === "string" ? ctx.authInfo.extra.origin : null), { legacy: "reject", responseMode: "json", onerror: error => logFailure("mcp-sdk", error) });
  return modern;
}

async function serveLegacy(request: Request, parsedBody: unknown, subject: ApiTokenSubject): Promise<Response> {
  const origin = originOf(request);
  const server = createMcpServer(subject, origin);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, { parsedBody, authInfo: authInfoOf(subject, origin) });
  } finally {
    await server.close();
  }
}

/** `subscriptions/listen` 요청이면 그 id(없으면 `null`), 아니면 `undefined`. */
function listenRequestId(body: unknown): string | number | null | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const message = body as { method?: unknown; id?: unknown };
  if (message.method !== "subscriptions/listen") return undefined;
  return typeof message.id === "string" || typeof message.id === "number" ? message.id : null;
}

export async function POST(request: Request): Promise<Response> {
  if (!checkOrigin(request.headers)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const token = parseBearer(request.headers.get("authorization"));
  if (token === null) return unauthorized();

  let subject: ApiTokenSubject | null;
  try {
    subject = await resolveApiToken(getPrisma(), token, new Date());
  } catch (error) {
    // 장애는 401이 아니다 — 에이전트가 "토큰이 무효"라고 사용자에게 재발급을 권하게 된다.
    logFailure("mcp-auth", error);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
  if (subject === null) return unauthorized();

  const text = await readBoundedText(request, MAX_BODY_BYTES);
  if (text === null) return NextResponse.json({ error: "too-large" }, { status: 400 });

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  // ⚠️ **배치를 받지 않는다** — 2025-06-18 개정(Codex)이 배치를 없앴고, 도구가 서면 배치 하나가 한 요청 안에서 DB 도구를 펼친다
  // (본문 상한은 바이트만 막는다). 어느 호출도 실행하지 않고 끊는다.
  if (Array.isArray(parsedBody)) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch requests are not supported" } }, { status: 400 });
  }
  // ⚠️ `listChanged: false`여도 SDK는 `subscriptions/listen`에 SSE를 연다(15초 keepalive — 함수를 `maxDuration`까지 붙잡고, 버스는
  // 모듈 전역이라 인스턴스 사이에 안 닿는다). 목록이 배포 사이에 안 바뀌므로 구독할 것이 없다 — SDK에 넘기기 전에 끊는다.
  const listen = listenRequestId(parsedBody);
  if (listen !== undefined) return NextResponse.json({ jsonrpc: "2.0", id: listen, error: { code: -32601, message: "Method not found" } });

  try {
    // 본문은 이미 읽었다 — 두 경로 모두 `parsedBody`로 넘겨 다시 읽지 않는다(원 요청의 헤더는 SDK가 그대로 검사한다).
    if (await isLegacyRequest(request, parsedBody)) return await serveLegacy(request, parsedBody, subject);
    return await modernHandler().fetch(request, { parsedBody, authInfo: authInfoOf(subject, originOf(request)) });
  } catch (error) {
    logFailure("mcp-dispatch", error);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
