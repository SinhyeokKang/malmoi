import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { lockUser } from "@/lib/auth/lock";
import type { OAuthEndpoint } from "@/lib/oauth/endpoint";
import { planRevoke, revokeLookup } from "@/lib/oauth/revoke";

/**
 * `/oauth/revoke` 코어 (RFC 7009 · mcp-oauth design §4.2). access·refresh 어느 쪽이든 **그 연결**을 끊고, 같은 사용자·클라이언트의 미교환
 * code를 같은 tx에서 지운다 — 대기하던 교환이 끊긴 연결을 되살리지 못한다. 잠금은 User가 먼저다(교환·refresh와 같은 순서).
 * 모르는 토큰·안 맞는 바인딩은 아무것도 안 하고 끝난다(응답은 같은 200). ⚠️ DB 장애는 던진다 — 끊지 못했는데 성공으로 말하지 않는다.
 */
export async function revokeToken(prisma: PrismaClient, input: { token: string; clientId: string }, endpoint: OAuthEndpoint): Promise<void> {
  const lookup = revokeLookup(input.token);
  if (lookup === null) return;
  const where = lookup.column === "accessTokenHash" ? { accessTokenHash: lookup.hash } : { refreshTokenHash: lookup.hash };
  const select = { id: true, userId: true, clientId: true, issuer: true, resource: true } as const;
  const head = await prisma.oAuthConnection.findUnique({ where, select });
  if (planRevoke({ row: head, clientId: input.clientId, endpoint }).status !== "revoke" || head === null) return;

  await prisma.$transaction(async tx => {
    if (!(await lockUser(tx, head.userId))) return;
    // 잠금 뒤 다시 읽는다 — 그 사이 회전됐으면 이 토큰은 이미 현재 것이 아니고, 재동의됐으면 새 연결은 건드리지 않는다.
    const row = await tx.oAuthConnection.findFirst({ where: { ...where, id: head.id, userId: head.userId }, select });
    const plan = planRevoke({ row, clientId: input.clientId, endpoint });
    if (plan.status !== "revoke" || row === null) return;
    await tx.oAuthConnection.deleteMany({ where: { id: plan.connectionId, userId: row.userId } });
    await tx.oAuthCode.deleteMany({ where: { userId: row.userId, clientId: row.clientId, usedAt: null } });
  });
}

/**
 * `/mcp`의 **연결별 끊기** (spec 조건 8·9 · design §4.2) — `revokeToken`과 같은 tx 모양을 토큰 대신 연결 ID로 한다. `userId`는 Action이 세션으로
 * 본판정한 값이다(쿠키는 호출자 쪽에 있다). User 잠금 뒤 **그 사용자의** 행을 다시 읽는다 — 남의 연결 ID는 없는 행이다(POSTMORTEM 2026-09-06).
 * 멱등이다: 없으면(다른 탭이 먼저 끊었거나 재동의로 교체됐다) 아무것도 안 하고 끝난다. ⚠️ DB 장애는 던진다 — 끊지 못했는데 성공으로 말하지 않는다.
 */
export async function disconnectConnection(prisma: PrismaClient, input: { userId: string; connectionId: string }): Promise<void> {
  const { userId, connectionId } = input;
  await prisma.$transaction(async tx => {
    if (!(await lockUser(tx, userId))) return;
    const row = await tx.oAuthConnection.findFirst({ where: { id: connectionId, userId }, select: { id: true, clientId: true } });
    if (row === null) return;
    await tx.oAuthConnection.deleteMany({ where: { id: row.id, userId } });
    // 대기하던 교환이 끊긴 연결을 되살리지 못하게 — 같은 사용자·클라이언트의 미교환 code를 같은 tx에서 지운다(spec 조건 14).
    await tx.oAuthCode.deleteMany({ where: { userId, clientId: row.clientId, usedAt: null } });
  });
}
