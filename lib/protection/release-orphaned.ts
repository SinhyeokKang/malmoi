import "server-only";

import type { Prisma } from "@/generated/prisma/client";

/**
 * **이번 적재로 orphan이 된 승인 셀의 토큰을 비운다** (delivery-invariants D1 · 감사 #1). upsert는 페이로드에 없는 셀에 안 닿아서, 폐기를
 * 승인한 Sync가 떨어뜨린 키·로케일의 셀에 토큰이 남았다. `pendingWhere`가 orphan을 빼므로 화면 어디에도 0으로 보이다가, 그 키가 코드에
 * 되살아나면 CI push가 unorphan → 사후 재집계 1 → 롤백 → `deferred`를 **매번** 반복했다.
 *
 * - **호출자가 둘이다** — 수동 Sync(`lib/import/run.ts`)와 제거된 소스의 되살림 첫 적재(`lib/surfaces/create.ts`, sources-add-remove).
 *   둘 다 사람이 승인한 토큰 집합을 받아 같은 tx에서 적재 직후 부른다.
 * - "이번 적재로 orphan이 됐다"를 따로 계산하지 않는다. Sync의 승인 집합은 `pendingWhere` 기준이라 승인 시점에 이미 orphan인 셀이 없어
 *   지금 orphan인 승인 셀은 전부 이번 적재가 만든 것이다(배포 전 잔존 유령 토큰은 여기서 안 풀린다). 되살림의 승인 집합은 그 소스 전체
 *   (orphan 포함)라 제거 때 이미 orphan이던 셀도 풀린다 — 제거 지문이 그 셀을 셌으므로 사용자 승인과 같다.
 * - ⚠️ **불완전 적재(`suppressOrphan`)와 짝이다** — 실패 파일의 키를 orphan으로 읽으면 그 키의 승인 토큰까지 풀린다(audit #7).
 * - ⚠️ **빈 값·실패 파일 승인 셀은 그대로다** — 토큰이 남아 `remainingEdits`로 보인다. "전부 해제"는 리포에 값이 없던 셀의 편집값을 pending
 *   아닌 채 남겨 다른 Publish에 조용히 싣는다(`/feature-review` CTO).
 * - ⚠️ **적재가 확정된 갈래(`payload`·`empty`)에서만 부른다** — tx 끝에 공통으로 두면 적재 안 된 표면의 편집이 사라진다(POSTMORTEM
 *   2026-09-09 "일회용 허가를 이벤트로 비웠다").
 * - `updatedAt`을 건드리지 않는다 — raw SQL이라 `@updatedAt`이 개입하지 않는다(`acknowledgeDelivered`와 같은 이유).
 */
export async function releaseOrphanedApproved(tx: Prisma.TransactionClient, scope: { projectId: string; surfaceId: string }, approvedTokens: readonly string[]): Promise<void> {
  if (approvedTokens.length === 0) return;
  await tx.$executeRaw`
    UPDATE "Translation" AS t SET "pendingEditToken" = NULL
    FROM "StringKey" k, "Locale" l
    WHERE t."projectId" = ${scope.projectId} AND t."surfaceId" = ${scope.surfaceId}
      AND t."pendingEditToken" = ANY(${[...approvedTokens]}::text[])
      AND k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId"
      AND l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode"
      AND (k."orphaned" OR l."orphaned")`;
}
