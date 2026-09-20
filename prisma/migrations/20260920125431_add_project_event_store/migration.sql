-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('TRANSLATION', 'IMPORT', 'PUBLISH', 'SURFACE', 'MEMBER', 'SETTINGS');

-- CreateEnum
CREATE TYPE "ActorKind" AS ENUM ('USER', 'AUTOMATION', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "activityCoverageStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProjectEvent" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "EventKind" NOT NULL,
    "subtype" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "result" TEXT,
    "actorKind" "ActorKind" NOT NULL,
    "actorUserId" TEXT,
    "surfaceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "surfaceScope" TEXT NOT NULL,
    "syncRunId" TEXT,
    "payload" JSONB NOT NULL,
    "searchText" TEXT,
    "runToken" TEXT,

    CONSTRAINT "ProjectEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectEvent_projectId_occurredAt_id_idx" ON "ProjectEvent"("projectId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEvent_projectId_ref_key" ON "ProjectEvent"("projectId", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEvent_projectId_runToken_key" ON "ProjectEvent"("projectId", "runToken");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEvent_projectId_syncRunId_key" ON "ProjectEvent"("projectId", "syncRunId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncRun_projectId_id_key" ON "SyncRun"("projectId", "id");

-- AddForeignKey
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_projectId_syncRunId_fkey" FOREIGN KEY ("projectId", "syncRunId") REFERENCES "SyncRun"("projectId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- Backfill: one referencing event per preserved Publish run (logs-rework decision 1).
-- Values are NOT copied — result, changed, prUrl and warnings stay in SyncRun and the query
-- joins them, so a RUNNING row that closes later cannot make the two disagree.
-- Deterministic ids keep a re-run a no-op; the (projectId, syncRunId) unique index is the guard.
-- Past target surfaces are unknowable, so the scope is 'not-recorded' and the array stays empty:
-- the run shows in the full list but not under a specific source or Project-wide filter.
INSERT INTO "ProjectEvent" (
  "id", "ref", "projectId", "kind", "subtype", "occurredAt", "finishedAt", "result",
  "actorKind", "actorUserId", "surfaceIds", "surfaceScope", "syncRunId", "payload", "searchText", "runToken"
)
SELECT
  'evt_bf_' || r."id",
  'evt_bf_' || r."id",
  r."projectId",
  'PUBLISH'::"EventKind",
  'publish.run',
  r."startedAt",
  NULL,
  NULL,
  (CASE WHEN r."trigger" = 'CRON' THEN 'AUTOMATION' ELSE 'USER' END)::"ActorKind",
  r."requestedBy",
  ARRAY[]::TEXT[],
  'not-recorded',
  r."id",
  jsonb_build_object('kind', 'PUBLISH', 'surfaceSlugs', jsonb_build_array(), 'refusal', NULL),
  lower('evt_bf_' || r."id"),
  NULL
FROM "SyncRun" r
ON CONFLICT ("projectId", "syncRunId") DO NOTHING;
