-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "adapterName" TEXT,
ADD COLUMN     "baseLocale" TEXT,
ADD COLUMN     "lastCommitSha" TEXT,
ADD COLUMN     "nested" BOOLEAN,
ADD COLUMN     "pathTemplate" TEXT;
