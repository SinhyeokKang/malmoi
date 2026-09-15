-- AlterTable
ALTER TABLE "Locale" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "TranslationSurface" ADD COLUMN     "lastImportFailedAt" TIMESTAMP(3);

-- Backfill: existing locales must not all claim the migration timestamp. A locale cannot predate
-- its project, and the project's creation time is less wrong than "now" -- which would push every
-- never-filled locale to the top of the attention list right after deploy, with no way back
-- (the real time is stored nowhere). TranslationSurface has no createdAt to borrow from.
UPDATE "Locale" l SET "createdAt" = p."createdAt"
  FROM "Project" p WHERE p."id" = l."projectId";
