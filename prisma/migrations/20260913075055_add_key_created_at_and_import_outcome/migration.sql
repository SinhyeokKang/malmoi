-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "lastImportError" TEXT,
ADD COLUMN     "lastImportStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StringKey" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: existing keys are treated as the initial baseline, not reconstructed.
-- The DEFAULT above stamped every existing row with the migration's clock, which would make the
-- whole catalog look "new since the last pull". COALESCE(lastPulledAt, Project.createdAt) puts each
-- key at or before that project's baseline instead: projects with pull history drop out of the
-- "New from GitHub" count, projects without it keep counting every live key (the approved definition).
UPDATE "StringKey" k
SET "createdAt" = COALESCE(p."lastPulledAt", p."createdAt")
FROM "Project" p
WHERE p."id" = k."projectId";
