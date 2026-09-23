import "server-only";
import type { Prisma } from "@/generated/prisma/client";

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
 */
export async function lockProjectAccess(
  tx: Prisma.TransactionClient,
  input: { projectId: string; userId: string; permission: Permission; surfaceId?: string; archiveToggle?: boolean },
): Promise<LockedAccess> {
  const { projectId, userId, surfaceId } = input;
  await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  if (surfaceId !== undefined) await tx.$executeRaw`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = ${projectId} AND "id" = ${surfaceId} FOR UPDATE`;
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { archivedAt: true } });
  if (project === null) return { status: "not-found" };
  const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { projectId: true, role: true } });
  const surface = surfaceId === undefined ? undefined
    : await tx.translationSurface.findFirst({ where: { id: surfaceId, projectId }, select: { archivedAt: true } });
  return planLockedAccess({ member, permission: input.permission, archivedAt: project.archivedAt, surface, archiveToggle: input.archiveToggle });
}
