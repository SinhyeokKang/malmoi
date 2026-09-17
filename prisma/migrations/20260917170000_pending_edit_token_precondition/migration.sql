-- sync-edit-protection 배포 B precondition. 스키마를 바꾸지 않는다.
--
-- 배포 B부터 "미전달 편집"은 토큰(pendingEditToken)으로만 판정한다. 배포 A 이전에 저장된 편집에 토큰이 없으면
-- 그 편집은 보호되지 않고 다음 CI 적재에 덮인다 — 그래서 backfill이 끝나지 않았으면 이 마이그레이션이 실패해
-- `pnpm db:deploy`(= /merge 1단계)를 멈춘다. 사람의 체크리스트에 기대지 않는다.
--
-- ⚠️ 조건은 lib/protection/backfill.ts의 BACKFILL_CONDITION_SQL과 같다(마이그레이션은 모듈을 import할 수 없다).
--
-- 실패 복구 (docs/OPERATIONS.md §3의 규칙 — 전부 롤백된 것을 확인한 경우에만. 체크섬 수정·무조건 applied·DB reset 금지):
--   1. PRISMA_TARGET=prod pnpm exec prisma migrate resolve --rolled-back 20260917170000_pending_edit_token_precondition
--      (dev는 PRISMA_TARGET 없이. `migrate dev`가 리셋을 제안하면 거부한다)
--   2. backfill: pnpm exec tsx scripts/backfill-pending-edit-token.ts (대상 DB의 DATABASE_URL로, 0행이 두 번 나올 때까지)
--   3. db:deploy 재시도
-- 편집을 버리거나 pending을 비워서 통과시키지 않는다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Translation" t
    JOIN "Project" p ON p."id" = t."projectId"
    JOIN "TranslationSurface" s ON s."projectId" = t."projectId" AND s."id" = t."surfaceId"
    JOIN "StringKey" k ON k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId"
    JOIN "Locale" l ON l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode"
    WHERE t."updatedBy" IS NOT NULL
      AND (p."lastPulledAt" IS NULL OR t."updatedAt" > p."lastPulledAt")
      AND s."archivedAt" IS NULL
      AND k."orphaned" = false
      AND l."orphaned" = false
      AND t."pendingEditToken" IS NULL
  ) THEN
    RAISE EXCEPTION 'precondition failed: unsent edits without pendingEditToken remain — run scripts/backfill-pending-edit-token.ts first';
  END IF;
END $$;
