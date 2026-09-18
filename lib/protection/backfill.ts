/**
 * 배포 A 이전 편집에 토큰을 채운다 (sync-edit-protection — OPERATIONS의 배포 절차 3단계).
 *
 * **SQL 한 문장이고 멱등이다** — 대상은 옛 술어(저자·시각) ∧ 활성 셀 ∧ 토큰 없음이라, 한 번 발급된 행은 다음 실행의
 * 대상에서 빠진다. 배포 A 롤아웃 뒤에는 dual-write가 새 저장에 토큰을 쓰므로 0행이 두 번 연속 나오면 수렴이다.
 *
 * ⚠️ **토큰을 더하기만 한다.** 옛 술어가 0인데 토큰이 남은 행(no-changes 경로 누락이 만드는 유령 pending)은
 * 여기서 못 지운다 — 그 방어선은 Publish CAS가 `no-changes`까지 덮는 것이다(`lib/pull/load.ts`).
 *
 * ⚠️ 배포 B의 precondition 마이그레이션이 **같은 조건**을 SQL로 복제한다(마이그레이션은 모듈을 import할 수 없다).
 * 이 상수를 바꾸면 그쪽도 함께 바꾼다.
 */
export const BACKFILL_CONDITION_SQL = `t."updatedBy" IS NOT NULL
  AND (p."lastPulledAt" IS NULL OR t."updatedAt" > p."lastPulledAt")
  AND s."archivedAt" IS NULL
  AND k."orphaned" = false
  AND l."orphaned" = false
  AND t."pendingEditToken" IS NULL`;

const BACKFILL_STATEMENT = `UPDATE "Translation" t
SET "pendingEditToken" = gen_random_uuid()::text
FROM "Project" p, "TranslationSurface" s, "StringKey" k, "Locale" l
WHERE p."id" = t."projectId"
  AND s."projectId" = t."projectId" AND s."id" = t."surfaceId"
  AND k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId"
  AND l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode"
  AND ${BACKFILL_CONDITION_SQL}`;

/**
 * ⚠️ `updatedAt`을 건드리지 않는다 — raw UPDATE라 `@updatedAt`이 개입하지 않는다. 시각이 움직이면 옛 술어와
 * `?state=new`가 흔들린다. 전 프로젝트를 한 문장으로 도는 운영 스크립트라 `projectId`로 좁히지 않는다(대상 조건이 행 단위다).
 */
export function backfillPendingEditTokens(db: { $executeRawUnsafe(query: string): Promise<number> }): Promise<number> {
  return db.$executeRawUnsafe(BACKFILL_STATEMENT);
}
