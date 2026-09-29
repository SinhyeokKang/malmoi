import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { lockUser } from "@/lib/auth/lock";
import { hashApiToken } from "@/lib/mcp/token";
import { OAUTH_REFRESH_PREFIX } from "@/lib/oauth/bearer";
import type { OAuthEndpoint } from "@/lib/oauth/endpoint";
import { planCodeExchange, planRefresh } from "@/lib/oauth/exchange";
import { accessExpiry, generateAccessToken, generateRefreshToken, type IssuedTokens } from "@/lib/oauth/tokens";

/**
 * `/oauth/token`의 두 grant (mcp-oauth design §4.1 · §4.2). 판정은 `lib/oauth/exchange.ts`가 하고 여기는 **잠금·재읽기·쓰기**다.
 *
 * - 잠금 순서는 **User → Connection**으로 통일한다(§4.2) — 교환·refresh·폐기·끊기가 같은 사용자에게 겹쳐도 교착하지 않고, 앞 tx의 커밋을
 *   뒤 tx의 재읽기가 본다(READ COMMITTED). 첫 조회는 잠글 사용자를 찾는 데만 쓰고, 판정은 잠금 뒤 다시 읽은 행으로만 한다.
 * - 거부는 `invalid_grant` 한 갈래이고 **쓰기 0건**이다. 예외는 재사용 폐기 하나 — 폐기를 커밋한 **뒤** `invalid_grant`다.
 * - ⚠️ **DB 장애는 던진다** — route가 `server_error` 500으로 낸다. `invalid_grant`로 접으면 클라이언트가 연결을 버리고 재로그인을 시킨다.
 * - 원문 토큰은 응답에만 있다 — 저장은 `hashApiToken`(개인 토큰과 같은 함수)이다.
 */

export type GrantResult = { status: "ok"; tokens: IssuedTokens } | { status: "invalid_grant" };

const INVALID = { status: "invalid_grant" } as const;

function issueTokens(now: Date, connectionExpiresAt: Date): IssuedTokens {
  return { accessToken: generateAccessToken(), refreshToken: generateRefreshToken(), accessExpiresAt: accessExpiry(now, connectionExpiresAt) };
}

/**
 * **authorization_code** — code의 발급 스냅샷만으로 검증하고(요청 행을 다시 읽지 않는다), 조건부 소비 · 같은 클라이언트의 기존 연결 삭제 ·
 * 새 연결 삽입을 한 tx로 확정한다(§4.2). 실패하면 기존 연결과 code가 그대로다. 새 동의가 먼저 커밋됐으면 이 code는 이미 지워져 없다.
 */
export async function exchangeAuthorizationCode(
  prisma: PrismaClient,
  input: { code: string; codeVerifier: string | undefined; clientId: string | undefined; redirectUri: string | undefined; resource: string | undefined },
  endpoint: OAuthEndpoint,
  now: Date,
): Promise<GrantResult> {
  const codeHash = hashApiToken(input.code);
  const head = await prisma.oAuthCode.findUnique({ where: { codeHash }, select: { userId: true } });
  if (head === null) return INVALID;

  return prisma.$transaction(async tx => {
    if (!(await lockUser(tx, head.userId))) return INVALID;
    const code = await tx.oAuthCode.findUnique({ where: { codeHash } });
    const plan = planCodeExchange({
      codeRow: code, now, clientId: input.clientId, redirectUri: input.redirectUri, resource: input.resource, verifier: input.codeVerifier,
      expectedIssuer: endpoint.issuer, expectedResource: endpoint.resource,
    });
    // 동의 시점에 정한 연결 수명이 이미 끝났으면 죽은 연결을 만들지 않는다(60초 code라 실제로는 안 닿는다).
    if (plan.status !== "ok" || code === null || code.connectionExpiresAt.getTime() <= now.getTime()) return INVALID;

    // 사용자 잠금 아래라 겹칠 수 없지만, 1회용은 조건부 UPDATE가 스스로 증명하게 둔다.
    const consumed = await tx.oAuthCode.updateMany({ where: { codeHash, usedAt: null }, data: { usedAt: now } });
    if (consumed.count !== 1) return INVALID;

    // 같은 클라이언트의 기존 연결 교체(`@@unique([userId, clientId])`) + 이 사용자의 만료 연결 정리(삽입 시점 정리 — 작업 큐 없음).
    await tx.oAuthConnection.deleteMany({ where: { userId: code.userId, OR: [{ clientId: code.clientId }, { expiresAt: { lte: now } }] } });
    const tokens = issueTokens(now, code.connectionExpiresAt);
    await tx.oAuthConnection.create({ data: {
      userId: code.userId, clientId: code.clientId, clientName: code.clientName, redirectUri: code.redirectUri, issuer: code.issuer, resource: code.resource,
      grants: code.grants, allProjects: code.allProjects, projectIds: code.projectIds,
      accessTokenHash: hashApiToken(tokens.accessToken), accessExpiresAt: tokens.accessExpiresAt,
      refreshTokenHash: hashApiToken(tokens.refreshToken), expiresAt: code.connectionExpiresAt,
    } });
    return { status: "ok", tokens } as const;
  });
}

/**
 * **refresh_token** (§4.1). 제시된 해시가 연결의 현재 refresh면 회전(이력 삽입 + 해시 교체, 한 tx), 그 연결의 이력에 있으면 회전 뒤 30초 안은
 * 거부만 하고 그 밖은 **그 연결을 폐기**한다(연결 삭제 — 이력은 cascade — + 같은 클라이언트의 미교환 code 삭제). 바인딩(client_id · 발급 환경 ·
 * resource)은 `planRefresh`가 회전·폐기보다 먼저 본다.
 */
export async function refreshConnection(
  prisma: PrismaClient,
  input: { refreshToken: string; clientId: string | undefined; resource: string | undefined },
  endpoint: OAuthEndpoint,
  now: Date,
): Promise<GrantResult> {
  // 접두가 다르면 우리 refresh가 아니다 — access·개인 토큰을 잘못 낸 요청이 조회를 일으키지 않는다.
  if (!input.refreshToken.startsWith(OAUTH_REFRESH_PREFIX)) return INVALID;
  const presentedHash = hashApiToken(input.refreshToken);
  const current = await prisma.oAuthConnection.findUnique({ where: { refreshTokenHash: presentedHash }, select: { id: true, userId: true } });
  const target = current
    ?? (await prisma.oAuthRefreshHistory.findUnique({ where: { tokenHash: presentedHash }, select: { connection: { select: { id: true, userId: true } } } }))?.connection
    ?? null;
  if (target === null) return INVALID;

  const outcome = await prisma.$transaction(async tx => {
    if (!(await lockUser(tx, target.userId))) return INVALID;
    await tx.$executeRaw`SELECT "id" FROM "OAuthConnection" WHERE "id" = ${target.id} AND "userId" = ${target.userId} FOR UPDATE`;
    const connection = await tx.oAuthConnection.findFirst({
      where: { id: target.id, userId: target.userId },
      select: { id: true, clientId: true, issuer: true, resource: true, refreshTokenHash: true, expiresAt: true },
    });
    const used = await tx.oAuthRefreshHistory.findUnique({ where: { tokenHash: presentedHash }, select: { tokenHash: true, connectionId: true, usedAt: true } });
    const plan = planRefresh({
      connectionRow: connection, presentedHash, usedTokenRow: used, now, clientId: input.clientId, resource: input.resource,
      expectedIssuer: endpoint.issuer, expectedResource: endpoint.resource,
    });

    if (plan.status === "rotate" && connection !== null) {
      const tokens = issueTokens(now, connection.expiresAt);
      await tx.oAuthRefreshHistory.create({ data: { tokenHash: presentedHash, connectionId: connection.id, usedAt: now } });
      await tx.oAuthConnection.update({
        where: { id: connection.id },
        data: { accessTokenHash: hashApiToken(tokens.accessToken), accessExpiresAt: tokens.accessExpiresAt, refreshTokenHash: hashApiToken(tokens.refreshToken) },
      });
      return { status: "ok", tokens } as const;
    }
    if (plan.status === "revoke-replayed-connection" && connection !== null) {
      await tx.oAuthConnection.deleteMany({ where: { id: plan.connectionId, userId: target.userId } });
      // 폐기된 연결을 뒤늦은 code 교환이 되살리지 못한다(§4.2).
      await tx.oAuthCode.deleteMany({ where: { userId: target.userId, clientId: connection.clientId, usedAt: null } });
      return INVALID;
    }
    // 유예 안의 재사용 · 바인딩 불일치 · 만료 — 쓰기 0건.
    return INVALID;
  });
  return outcome;
}
