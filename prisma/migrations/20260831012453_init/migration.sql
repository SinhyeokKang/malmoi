-- CreateTable
CREATE TABLE "Locale" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isBase" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Locale_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "StringKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "description" TEXT,
    "orphaned" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StringKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyRef" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "line" INTEGER NOT NULL,

    CONSTRAINT "KeyRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "localeCode" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StringKey_key_key" ON "StringKey"("key");

-- CreateIndex
CREATE INDEX "StringKey_namespace_idx" ON "StringKey"("namespace");

-- CreateIndex
CREATE INDEX "StringKey_orphaned_idx" ON "StringKey"("orphaned");

-- CreateIndex
CREATE INDEX "KeyRef_keyId_idx" ON "KeyRef"("keyId");

-- CreateIndex
CREATE INDEX "Translation_localeCode_needsReview_idx" ON "Translation"("localeCode", "needsReview");

-- CreateIndex
CREATE UNIQUE INDEX "Translation_keyId_localeCode_key" ON "Translation"("keyId", "localeCode");

-- AddForeignKey
ALTER TABLE "KeyRef" ADD CONSTRAINT "KeyRef_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "StringKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "StringKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_localeCode_fkey" FOREIGN KEY ("localeCode") REFERENCES "Locale"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
