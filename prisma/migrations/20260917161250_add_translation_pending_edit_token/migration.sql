-- AlterTable
ALTER TABLE "Translation" ADD COLUMN     "pendingEditToken" TEXT;

-- CreateIndex
CREATE INDEX "Translation_projectId_pendingEditToken_idx" ON "Translation"("projectId", "pendingEditToken");

