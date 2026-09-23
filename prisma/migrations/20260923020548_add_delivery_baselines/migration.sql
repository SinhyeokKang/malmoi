-- CreateTable
CREATE TABLE "DeliveryConfirmation" (
    "projectId" TEXT NOT NULL,
    "surfaceId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "contextFingerprint" TEXT NOT NULL,
    "invalidatedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryConfirmation_pkey" PRIMARY KEY ("projectId","surfaceId")
);

-- CreateTable
CREATE TABLE "TranslationBaseline" (
    "projectId" TEXT NOT NULL,
    "surfaceId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "localeCode" TEXT NOT NULL,
    "restoreValue" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationBaseline_pkey" PRIMARY KEY ("projectId","surfaceId","keyId","localeCode")
);

-- AddForeignKey
ALTER TABLE "DeliveryConfirmation" ADD CONSTRAINT "DeliveryConfirmation_projectId_surfaceId_fkey" FOREIGN KEY ("projectId", "surfaceId") REFERENCES "TranslationSurface"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryConfirmation" ADD CONSTRAINT "DeliveryConfirmation_projectId_syncRunId_fkey" FOREIGN KEY ("projectId", "syncRunId") REFERENCES "SyncRun"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationBaseline" ADD CONSTRAINT "TranslationBaseline_projectId_surfaceId_keyId_fkey" FOREIGN KEY ("projectId", "surfaceId", "keyId") REFERENCES "StringKey"("projectId", "surfaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationBaseline" ADD CONSTRAINT "TranslationBaseline_projectId_surfaceId_localeCode_fkey" FOREIGN KEY ("projectId", "surfaceId", "localeCode") REFERENCES "Locale"("projectId", "surfaceId", "code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationBaseline" ADD CONSTRAINT "TranslationBaseline_projectId_surfaceId_fkey" FOREIGN KEY ("projectId", "surfaceId") REFERENCES "DeliveryConfirmation"("projectId", "surfaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
