-- DropForeignKey
ALTER TABLE "Translation" DROP CONSTRAINT "Translation_keyId_fkey";
-- DropForeignKey
ALTER TABLE "Translation" DROP CONSTRAINT "Translation_localeCode_fkey";
-- DropIndex
DROP INDEX "StringKey_key_key";
-- DropIndex
DROP INDEX "StringKey_namespace_idx";
-- DropIndex
DROP INDEX "StringKey_orphaned_idx";
-- DropIndex
DROP INDEX "Translation_localeCode_needsReview_idx";
-- AlterTable
ALTER TABLE "Locale" DROP CONSTRAINT "Locale_pkey",
ADD COLUMN     "projectId" TEXT NOT NULL,
ADD CONSTRAINT "Locale_pkey" PRIMARY KEY ("projectId", "code");
-- AlterTable
ALTER TABLE "StringKey" ADD COLUMN     "projectId" TEXT NOT NULL;
-- AlterTable
ALTER TABLE "Translation" ADD COLUMN     "projectId" TEXT NOT NULL;
-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repoOwner" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "baseBranch" TEXT NOT NULL DEFAULT 'main',
    "installationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
-- CreateIndex
CREATE INDEX "StringKey_projectId_namespace_idx" ON "StringKey"("projectId", "namespace");
-- CreateIndex
CREATE INDEX "StringKey_projectId_orphaned_idx" ON "StringKey"("projectId", "orphaned");
-- CreateIndex
CREATE UNIQUE INDEX "StringKey_projectId_key_key" ON "StringKey"("projectId", "key");
-- CreateIndex
CREATE UNIQUE INDEX "StringKey_projectId_id_key" ON "StringKey"("projectId", "id");
-- CreateIndex
CREATE INDEX "Translation_projectId_localeCode_needsReview_idx" ON "Translation"("projectId", "localeCode", "needsReview");
-- AddForeignKey
ALTER TABLE "Locale" ADD CONSTRAINT "Locale_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StringKey" ADD CONSTRAINT "StringKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_projectId_keyId_fkey" FOREIGN KEY ("projectId", "keyId") REFERENCES "StringKey"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_projectId_localeCode_fkey" FOREIGN KEY ("projectId", "localeCode") REFERENCES "Locale"("projectId", "code") ON DELETE RESTRICT ON UPDATE CASCADE;
