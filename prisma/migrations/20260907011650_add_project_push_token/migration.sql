-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "pushTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_pushTokenHash_key" ON "Project"("pushTokenHash");

