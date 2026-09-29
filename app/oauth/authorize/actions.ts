"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signOut } from "@/auth";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { logFailure } from "@/lib/github-connect/log";
import { oauthEndpoint } from "@/lib/oauth/endpoint";
import { denyAuthorizationRequest, issueAuthorizationCode, readAuthorizationRequest } from "@/lib/oauth-server/authorize";
import { routes } from "@/lib/routes";

/**
 * `/oauth/authorize`의 **Authorize · Deny · Check request · Not you?** (mcp-oauth design §1 · §4.2 · 핸드오프 §8·§10).
 *
 * ⚠️ **세션은 여기서 다시 본다** — 화면을 그린 뒤 세션이 끝났을 수 있다(design §4.2 "현재 세션 재확인"). 무세션은 같은 요청의 로그인 화면으로
 * 돌려보내고(`e=signed-out` → `1k`) 요청은 소비하지 않는다. 판정·잠금·소비는 서버 코어(`lib/oauth-server/authorize.ts`)가 한다.
 * ⚠️ **발급 환경은 이 요청의 origin이다** — 요청 행이 다른 origin에 묶여 있으면 코어가 "없는 요청"으로 답한다(spec 조건 13).
 * ⚠️ **결과를 셋으로 가른다**(핸드오프 §10.4): 성공은 검증된 콜백으로 `redirect`, 명시 거부(입력·장애)는 값을 돌려 화면이 입력을 보존한 채
 * Alert를 세우고, 요청이 없거나 끝났으면 같은 주소로 돌려보내 그 화면이 종료를 말한다(중복 제출 → `1n`). 응답 유실은 호출부가 판정한다.
 */

const RequestId = z.string().min(1).max(128);

/** 클라이언트가 보낸다 — 모양만 여기서 보고 값 판정은 `planConsent`(= 개인 토큰 발급과 같은 판정)가 한다. */
const AuthorizeInput = z.object({
  requestId: RequestId,
  expiresInDays: z.number(),
  grants: z.array(z.string()).max(8),
  scope: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("all") }),
    z.object({ kind: z.literal("projects"), projectIds: z.array(z.string().min(1)).max(100) }),
  ]),
});

export type ConsentActionResult = { ok: false; reason: "invalid" | "unavailable" };
export type CheckRequestResult = { status: "pending" | "ended" | "unavailable" };

/** 세션을 다시 읽는다 — 무세션이면 같은 요청의 로그인 화면으로(요청은 그대로), 장애면 `null`(명시 실패). */
async function currentUser(requestId: string): Promise<string | null> {
  const session = await readSession();
  if (session.status === "none") redirect(routes.oauthAuthorize({ request: requestId, e: "signed-out" }));
  return session.status === "ok" ? session.userId : null;
}

export async function authorizeOAuthRequest(raw: unknown): Promise<ConsentActionResult> {
  const input = AuthorizeInput.safeParse(raw);
  if (!input.success) return { ok: false, reason: "invalid" };
  const { requestId, expiresInDays, grants, scope } = input.data;
  const userId = await currentUser(requestId);
  const endpoint = oauthEndpoint(await headers());
  if (userId === null || endpoint === null) return { ok: false, reason: "unavailable" };

  let result: Awaited<ReturnType<typeof issueAuthorizationCode>>;
  try {
    result = await issueAuthorizationCode(getPrisma(), { requestId, userId, consent: { expiresInDays, grants, scope }, endpoint, now: new Date() });
  } catch (error) {
    logFailure("oauth-authorize", error);
    return { ok: false, reason: "unavailable" };
  }
  // ⚠️ 콜백은 요청 행에 저장된(= 저장 시점에 등록 대조를 지난) 주소다 — 이 Action의 입력으로 만들지 않는다.
  if (result.status === "issued") redirect(result.redirect);
  if (result.status === "invalid") return { ok: false, reason: "invalid" };
  redirect(routes.oauthAuthorize({ request: requestId }));
}

export async function denyOAuthRequest(raw: unknown): Promise<ConsentActionResult> {
  const requestId = RequestId.safeParse(raw);
  if (!requestId.success) return { ok: false, reason: "invalid" };
  const userId = await currentUser(requestId.data);
  const endpoint = oauthEndpoint(await headers());
  if (userId === null || endpoint === null) return { ok: false, reason: "unavailable" };

  let result: Awaited<ReturnType<typeof denyAuthorizationRequest>>;
  try {
    result = await denyAuthorizationRequest(getPrisma(), { requestId: requestId.data, endpoint, now: new Date() });
  } catch (error) {
    logFailure("oauth-deny", error);
    return { ok: false, reason: "unavailable" };
  }
  if (result.status === "denied") redirect(result.redirect);
  redirect(routes.oauthAuthorize({ request: requestId.data }));
}

/**
 * `Check request`(핸드오프 `1j`) — 응답을 잃은 뒤 요청이 아직 대기인지 본다. **읽기만 한다.** 대기면 화면이 폼으로 돌아가고, 끝났으면 화면을
 * 다시 그려 종료(`1n`·`1m`)를 말한다. 세션은 보지 않는다 — 요청 상태는 사용자와 무관하고, 대기로 돌아간 뒤의 행동이 세션을 다시 본다.
 */
export async function checkOAuthRequest(raw: unknown): Promise<CheckRequestResult> {
  const requestId = RequestId.safeParse(raw);
  const endpoint = oauthEndpoint(await headers());
  if (!requestId.success || endpoint === null) return { status: "ended" };
  try {
    const read = await readAuthorizationRequest(getPrisma(), { requestId: requestId.data, endpoint, now: new Date() });
    return { status: read.status === "ok" ? "pending" : "ended" };
  } catch (error) {
    logFailure("oauth-check", error);
    return { status: "unavailable" };
  }
}

/**
 * `Not you?`(핸드오프 `1s`) — 로그아웃하고 **같은 요청**의 로그인 화면으로 돌아간다. 폼 선택은 버린다(계정이 바뀌면 멤버십이 달라 옛 선택이
 * 거짓이 된다 — §9). 요청은 소비하지 않는다.
 */
export async function switchOAuthAccount(raw: unknown): Promise<void> {
  const requestId = RequestId.safeParse(raw);
  await signOut({ redirectTo: requestId.success ? routes.oauthAuthorize({ request: requestId.data, e: "switch" }) : routes.signIn() });
}
