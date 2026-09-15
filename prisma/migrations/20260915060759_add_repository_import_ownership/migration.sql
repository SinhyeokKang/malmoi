-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "repositoryImportStartedAt" TIMESTAMP(3),
ADD COLUMN     "repositoryImportToken" TEXT;

-- AlterTable
ALTER TABLE "TranslationSurface" ADD COLUMN     "importRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastImportToken" TEXT;
