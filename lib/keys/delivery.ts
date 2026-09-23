import type { Prisma } from "@/generated/prisma/client";
import { confirmationValid, deliveryContextFingerprint } from "@/lib/translations/context";

/**
 * 소스의 **현재** 전달 확인 상태 (translation-rework — ARCHITECTURE §5.8). 저장(기준 기록 여부)과 Revert(복원 가능 여부)가
 * 같은 판정을 쓴다 — 둘이 갈리면 저장은 기준을 남겼는데 Revert가 그것을 무효로 읽거나 그 반대가 된다.
 *
 * ⚠️ **잠금 뒤에 부른다** — 지문의 입력(설정·`importRevision`)이 호출부의 판정과 같은 순간이어야 한다.
 * ⚠️ `server-only`를 붙이지 않는다 — 격리 PG 통합 테스트가 직접 부른다(`lib/pull/load.ts`와 같은 이유).
 */
export type DeliveryState = {
  revision: string;
  valid: boolean;
  /** 확인을 세운 실행의 시작 시각 — 교체된 실행의 종료 판정(`revertSettled`)이 읽는다. */
  runStartedAt: Date;
  contextFingerprint: string;
};

export async function readDeliveryState(tx: Prisma.TransactionClient, projectId: string, surfaceId: string): Promise<DeliveryState | null> {
  const row = await tx.deliveryConfirmation.findUnique({
    where: { projectId_surfaceId: { projectId, surfaceId } },
    select: { revision: true, invalidatedAt: true, contextFingerprint: true, syncRun: { select: { startedAt: true } } },
  });
  if (row === null) return null;
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { repositoryId: true, baseBranch: true } });
  const surface = await tx.translationSurface.findFirstOrThrow({ where: { id: surfaceId, projectId } });
  const current = deliveryContextFingerprint({ repositoryId: project.repositoryId, baseBranch: project.baseBranch, surface });
  return { revision: row.revision, valid: confirmationValid(row, current), runStartedAt: row.syncRun.startedAt, contextFingerprint: row.contextFingerprint };
}

/** 이 프로젝트의 Publish가 진행 중인가 — 그 실행이 지금 값을 보냈는지 아직 모른다. */
export async function publishInFlight(tx: Prisma.TransactionClient, projectId: string): Promise<boolean> {
  return (await tx.syncRun.count({ where: { projectId, status: "RUNNING" } })) > 0;
}
