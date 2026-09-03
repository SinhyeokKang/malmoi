-- AlterTable
ALTER TABLE "StringKey" ADD COLUMN     "sortIndex" INTEGER;

-- AlterTable
ALTER TABLE "Translation" ADD COLUMN     "description" TEXT,
ADD COLUMN     "placeholders" JSONB;
