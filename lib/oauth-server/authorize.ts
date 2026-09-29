import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { lockUser } from "@/lib/auth/lock";
import { hashApiToken } from "@/lib/mcp/token";
import type { AuthorizeRequest } from "@/lib/oauth/authorize";
import { callbackRedirect } from "@/lib/oauth/callback";
import type { ClientMetadata } from "@/lib/oauth/client-metadata";
import { planConsent } from "@/lib/oauth/consent";
import type { OAuthEndpoint } from "@/lib/oauth/endpoint";
import { planRedirectUri } from "@/lib/oauth/redirect";
import { AUTHORIZATION_CODE_TTL_MS, AUTHORIZATION_REQUEST_TTL_MS, generateAuthorizationCode, generateRequestId } from "@/lib/oauth/tokens";

/**
 * **동의 화면의 서버 코어** (mcp-oauth design §1 · §4.2) — `/oauth/authorize` 페이지와 Authorize·Deny Server Action(T7)이 부른다.
 * 여기는 세션을 읽지 않는다 — `userId`는 Action이 `readSession`으로 본판정한 값을 넘긴다(쿠키 경계는 호출자 쪽에 있다).
 *
 * - 요청 행은 로그인 왕복 동안 검증된 요청을 들고 있다. **발급 환경에 묶인다** — 다른 origin에서 온 읽기·동의는 "없는 요청"이다.
 * - Authorize는 **User → 요청 행** 순서로 잠그고 요청 상태·멤버십을 다시 읽는다. 같은 사용자·클라이언트의 이전 미교환 code 무효화 ·
 *   요청 소비 · 새 code 삽입이 한 tx다. 요청당 code는 하나다(`requestId @unique`로도 막는다).
 * - Deny는 요청을 조건부로 소비한다 — Authorize와 겹치면 먼저 소비한 한 건만 성공한다.
 * - 거부 사유(`missing`·`expired`·`consumed`)는 화면이 "명시적으로 끝낸다"(spec 조건 3)에 쓴다. 콜백으로는 돌려보내지 않는다 —
 *   요청을 못 믿으면 되돌려 보낼 곳도 못 믿는다.
 */

export type RequestUnavailable = { status: "unavailable"; reason: "missing" | "expired" | "consumed" };

type RequestRow = {
  clientId: string; clientName: string | null; redirectUri: string; state: string | null; codeChallenge: string;
  issuer: string; resource: string; expiresAt: Date; consumedAt: Date | null;
};

/** 다른 환경의 요청은 존재를 말하지 않는다 — 같은 DB를 보는 preview와 로컬이 서로의 요청을 이어 받지 않는다. */
function requestState(row: RequestRow | null, endpoint: OAuthEndpoint, now: Date): RequestUnavailable | null {
  if (row === null || row.issuer !== endpoint.issuer || row.resource !== endpoint.resource) return { status: "unavailable", reason: "missing" };
  if (row.consumedAt !== null) return { status: "unavailable", reason: "consumed" };
  if (row.expiresAt.getTime() <= now.getTime()) return { status: "unavailable", reason: "expired" };
  return null;
}

/**
 * 검증된 authorize 요청을 저장한다 — 페이지가 `?request=<id>`로 정규화한다. 호출자가 `parseAuthorizeRequest`와 CIMD 가져오기를 끝낸 값을 넘기고,
 * 여기서 **콜백 등록 대조와 발급 환경을 한 번 더** 본다(저장되는 순간 이 행이 콜백의 근거가 된다). 만료 행 정리를 같은 tx에서 한다.
 */
export async function storeAuthorizationRequest(
  prisma: PrismaClient,
  input: { request: AuthorizeRequest; client: ClientMetadata; endpoint: OAuthEndpoint; now: Date },
): Promise<{ ok: true; requestId: string } | { ok: false }> {
  const { request, client, endpoint, now } = input;
  if (request.clientId !== client.clientId || request.resource !== endpoint.resource || !planRedirectUri(client.redirectUris, request.redirectUri)) {
    return { ok: false };
  }
  const requestId = generateRequestId();
  await prisma.$transaction([
    prisma.oAuthAuthorizationRequest.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.oAuthAuthorizationRequest.create({ data: {
      id: requestId, clientId: request.clientId, clientName: client.clientName, redirectUri: request.redirectUri, state: request.state,
      codeChallenge: request.codeChallenge, issuer: endpoint.issuer, resource: endpoint.resource,
      expiresAt: new Date(now.getTime() + AUTHORIZATION_REQUEST_TTL_MS),
    } }),
  ]);
  return { ok: true, requestId };
}

/** 동의 화면이 그릴 정보. 원문 state·challenge는 내지 않는다. */
export async function readAuthorizationRequest(
  prisma: PrismaClient,
  input: { requestId: string; endpoint: OAuthEndpoint; now: Date },
): Promise<{ status: "ok"; request: { clientId: string; clientName: string | null; redirectUri: string } } | RequestUnavailable> {
  const row = await prisma.oAuthAuthorizationRequest.findUnique({ where: { id: input.requestId } });
  const unavailable = requestState(row, input.endpoint, input.now);
  if (unavailable !== null || row === null) return unavailable ?? { status: "unavailable", reason: "missing" };
  return { status: "ok", request: { clientId: row.clientId, clientName: row.clientName, redirectUri: row.redirectUri } };
}

export type ConsentInput = { expiresInDays: number; grants: readonly string[]; scope: { kind: "all" } | { kind: "projects"; projectIds: readonly string[] } };

/**
 * **Authorize** — 동의 결과를 code에 싣고 콜백 URL을 준다(Action이 그대로 `redirect`한다). 동의 입력이 틀리면 요청을 **소비하지 않는다** — 화면이
 * 입력을 보존한 채 다시 낼 수 있다. 판정은 `planConsent`(= 개인 토큰 발급과 같은 어휘·만료·현재 비보관 멤버십 범위)다.
 */
export async function issueAuthorizationCode(
  prisma: PrismaClient,
  input: { requestId: string; userId: string; consent: ConsentInput; endpoint: OAuthEndpoint; now: Date },
): Promise<{ status: "issued"; redirect: string } | { status: "invalid"; field: "expiresIn" | "grants" | "scope" } | RequestUnavailable> {
  const { requestId, userId, endpoint, now } = input;
  return prisma.$transaction(async tx => {
    // 사용자가 사라졌으면(계정 삭제) 발급할 주체가 없다 — 요청은 그대로 둔다.
    if (!(await lockUser(tx, userId))) return { status: "unavailable", reason: "missing" } as const;
    await tx.$executeRaw`SELECT "id" FROM "OAuthAuthorizationRequest" WHERE "id" = ${requestId} FOR UPDATE`;
    const request = await tx.oAuthAuthorizationRequest.findUnique({ where: { id: requestId } });
    const unavailable = requestState(request, endpoint, now);
    if (unavailable !== null || request === null) return unavailable ?? { status: "unavailable", reason: "missing" } as const;

    const members = await tx.projectMember.findMany({ where: { userId, project: { archivedAt: null } }, select: { projectId: true } });
    const plan = planConsent({ ...input.consent, memberProjectIds: members.map(m => m.projectId), now });
    if (plan.status === "invalid") return { status: "invalid", field: plan.field } as const;

    // 새 동의는 같은 클라이언트의 이전 미교환 code를 무효로 한다(spec 조건 14). 이 사용자의 만료 code도 여기서 정리한다.
    await tx.oAuthCode.deleteMany({ where: { userId, OR: [{ clientId: request.clientId, usedAt: null }, { expiresAt: { lte: now } }] } });
    const consumed = await tx.oAuthAuthorizationRequest.updateMany({ where: { id: requestId, consumedAt: null }, data: { consumedAt: now } });
    if (consumed.count !== 1) return { status: "unavailable", reason: "consumed" } as const;

    const code = generateAuthorizationCode();
    // ⚠️ 검증 필드는 요청 행에서 복사한 스냅샷이다 — 교환은 요청 행을 다시 읽지 않는다(요청 정리가 code를 지우지 않는다).
    await tx.oAuthCode.create({ data: {
      codeHash: hashApiToken(code), requestId, clientId: request.clientId, clientName: request.clientName, redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge, issuer: request.issuer, resource: request.resource,
      userId, grants: plan.grants, allProjects: plan.allProjects, projectIds: plan.projectIds, connectionExpiresAt: plan.connectionExpiresAt,
      expiresAt: new Date(now.getTime() + AUTHORIZATION_CODE_TTL_MS),
    } });
    return { status: "issued", redirect: callbackRedirect(request.redirectUri, { code, state: request.state }) } as const;
  });
}

/** **Deny** — 요청을 조건부로 소비하고 `access_denied` + 원래 state로 돌려보낸다(RFC 6749 §4.1.2.1). */
export async function denyAuthorizationRequest(
  prisma: PrismaClient,
  input: { requestId: string; endpoint: OAuthEndpoint; now: Date },
): Promise<{ status: "denied"; redirect: string } | RequestUnavailable> {
  const { requestId, endpoint, now } = input;
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT "id" FROM "OAuthAuthorizationRequest" WHERE "id" = ${requestId} FOR UPDATE`;
    const request = await tx.oAuthAuthorizationRequest.findUnique({ where: { id: requestId } });
    const unavailable = requestState(request, endpoint, now);
    if (unavailable !== null || request === null) return unavailable ?? { status: "unavailable", reason: "missing" } as const;
    await tx.oAuthAuthorizationRequest.update({ where: { id: requestId }, data: { consumedAt: now } });
    return { status: "denied", redirect: callbackRedirect(request.redirectUri, { error: "access_denied", state: request.state }) } as const;
  });
}
