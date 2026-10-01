import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { planWriteLock } from "@/lib/sync/plan";

/**
 * Home 착지 때 적재 lease가 살아 있나 (sync-lock R5) — `[Sync]`와 실패 배너의 `[Try again]`이 번역 화면과 같은 사유로 멈춘다. 판정은 저장 거부와
 * 같은 `planWriteLock`이다. ⚠️ **실행권 토큰은 돌려주지 않는다** — 결과가 클라이언트 prop이 된다. ⚠️ 착지 시점의 사실이다: 막는 것은 서버다.
 */
export async function loadWriteLock(prisma: PrismaClient, projectId: string, now: Date): Promise<{ startedAt: Date; reopensBy: Date } | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { repositoryImportToken: true, repositoryImportStartedAt: true } });
  if (project === null) return null;
  const lock = planWriteLock({ now, ...project });
  return lock === null ? null : { startedAt: lock.startedAt, reopensBy: lock.reopensBy };
}
