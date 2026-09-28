import "server-only";
import type { Prisma } from "@/generated/prisma/client";

import type { TokenGrant } from "@/lib/mcp/grant";
import { planLockedToken, type LockedToken } from "@/lib/mcp/locked-token";

import { planLockedAccess, type LockedAccess } from "./access";
import type { Permission } from "./permission";

/**
 * `User` 행을 트랜잭션 끝까지 잠근다 — 없으면 `false`. 세 인증 왕복(회수 · 계정 연결 · 계정 병합)의 challenge 소비가
 * 같은 사용자에게 겹치지 않게 하는 자리다. 셋이 같은 SQL을 따로 들고 있었다(launch-readiness L7.4).
 */
export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  return rows.length === 1;
}

/**
 * `Project`(→`TranslationSurface`) 행을 잠그고 **그 뒤에** 호출자의 멤버십·역할과 보관 상태를 다시 읽는다 (감사 #9·#10·#26).
 *
 * 진입점의 `getProjectAccess`는 잠금 전 1회라, 잠금을 기다리는 동안 커밋된 멤버 제거·강등·보관을 못 본다 —
 * POSTMORTEM 2026-09-23(Revert)의 결함이 OWNER Action 전부와 저장·Publish에 같은 모양으로 있었다.
 * ⚠️ **쓰는 트랜잭션의 첫 문장이어야 한다** — 잠금 순서(Project → Surface)가 CI 적재·Publish 확정과 같아야 교착하지 않고,
 * 이 뒤의 읽기가 전부 잠금 뒤 값이어야 한다. `app/__tests__/locked-access.test.ts`가 대상 자리를 전수로 센다.
 *
 * **MCP 토큰 주체면 토큰도 잠금 뒤 다시 읽는다** (mcp-connector design §1.25). `tokenId`는 `ApiToken.tokenHash`다 — 행의 키가
 * `userId`라 `userId`만으로 읽으면 대기 중 재발급된 **새** 토큰의 권한으로 옛 토큰의 쓰기가 통과한다(spec 조건 6). 행 잠금은
 * 더하지 않는다(`FOR SHARE`는 병렬 읽기 도구의 `lastUsedAt` 갱신을 이 tx 뒤에 줄 세운다) — READ COMMITTED 재읽기로 충분하다.
 * 요구 grant는 `permission` 그대로다 — 쓰기 도구는 전부 역할 permission과 같은 grant를 요구한다(`lib/mcp/catalog.ts`).
 */
export async function lockProjectAccess(
  tx: Prisma.TransactionClient,
  input: { projectId: string; userId: string; permission: Permission; surfaceId?: string; archiveToggle?: boolean; tokenId?: string },
): Promise<LockedAccess> {
  const { projectId, userId, surfaceId } = input;
  await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  if (surfaceId !== undefined) await tx.$executeRaw`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = ${projectId} AND "id" = ${surfaceId} FOR UPDATE`;
  const token = await lockApiToken(tx, { tokenId: input.tokenId, userId, projectId, grant: input.permission });
  // 인증·범위는 멤버십보다 먼저다 — 범위 밖 프로젝트의 역할·보관이 새지 않는다.
  if (token.status !== "ok") return token;
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { archivedAt: true } });
  if (project === null) return { status: "not-found" };
  const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { projectId: true, role: true } });
  const surface = surfaceId === undefined ? undefined
    : await tx.translationSurface.findFirst({ where: { id: surfaceId, projectId }, select: { archivedAt: true } });
  const access = planLockedAccess({ member, permission: input.permission, archivedAt: project.archivedAt, surface, archiveToggle: input.archiveToggle });
  if (access.status === "ok" && token.grant === "token-scope") return { status: "token-scope" };
  return access;
}

/**
 * **잠금 뒤 `ApiToken` 재읽기** (mcp-connector design §1.25). `lockProjectAccess`를 지나지 않고 raw `FOR UPDATE`로 잠그는 쓰기
 * (수동 Sync 실행권 · Revert · 소스 추가 · 프로젝트 생성)가 **잠금 직후** 부른다. 세션 주체(`tokenId` 없음)는 통과다.
 *
 * ⚠️ `grant: "token-scope"`는 거부가 아니라 값이다 — 호출자가 멤버십·역할 판정 **뒤에** 거부로 낸다(역할 → 토큰 순서).
 * ⚠️ 행 잠금을 더하지 않는다 — READ COMMITTED 재읽기로 먼저 커밋된 폐기·재발급을 본다(`lockProjectAccess`와 같은 판단).
 */
export async function lockApiToken(
  tx: Prisma.TransactionClient,
  input: { tokenId: string | undefined; userId: string; projectId: string | null; grant: TokenGrant },
): Promise<LockedToken> {
  if (input.tokenId === undefined) return { status: "ok", grant: "ok" };
  const row = await tx.apiToken.findFirst({
    // ⚠️ 해시까지 조건이다 — `userId`만으로 읽으면 재발급된 새 토큰의 권한으로 옛 토큰의 쓰기가 통과한다(spec 조건 6).
    where: { userId: input.userId, tokenHash: input.tokenId },
    select: { grants: true, allProjects: true, projectIds: true, expiresAt: true },
  });
  return planLockedToken({ row, now: new Date(), projectId: input.projectId, grant: input.grant });
}
