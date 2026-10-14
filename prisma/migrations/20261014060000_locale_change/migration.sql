-- locale-add (design §1·§7): 언어 변경 의도와 소스별 전달된 파일 집합 변경. additive — 기존 행 백필 없음(NULL = 전달한 것 없음).

-- CreateEnum
CREATE TYPE "LocaleChangeOperation" AS ENUM ('ADD', 'REMOVE');

-- AlterTable
ALTER TABLE "DeliveryConfirmation" ADD COLUMN     "deliveredLocaleChanges" JSONB;

-- CreateTable
CREATE TABLE "LocaleChange" (
    "projectId" TEXT NOT NULL,
    "surfaceId" TEXT NOT NULL,
    "localeCode" TEXT NOT NULL,
    "operation" "LocaleChangeOperation" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocaleChange_pkey" PRIMARY KEY ("projectId","surfaceId","localeCode")
);

-- AddForeignKey
ALTER TABLE "LocaleChange" ADD CONSTRAINT "LocaleChange_projectId_surfaceId_localeCode_fkey" FOREIGN KEY ("projectId", "surfaceId", "localeCode") REFERENCES "Locale"("projectId", "surfaceId", "code") ON DELETE RESTRICT ON UPDATE CASCADE;
