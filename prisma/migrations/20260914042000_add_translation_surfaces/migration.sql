BEGIN;
ALTER TABLE "Locale" ADD COLUMN "surfaceId" TEXT;
ALTER TABLE "Project" ADD COLUMN "defaultSurfaceId" TEXT;
ALTER TABLE "StringKey" ADD COLUMN "surfaceId" TEXT;
ALTER TABLE "Translation" ADD COLUMN "surfaceId" TEXT;

CREATE TABLE "TranslationSurface" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "adapterName" TEXT,
  "pathTemplate" TEXT,
  "nested" BOOLEAN,
  "nestedByPath" JSONB,
  "baseLocale" TEXT,
  "declaredBaseLocale" TEXT,
  "lastCommitSha" TEXT,
  "lastCommitAt" TIMESTAMP(3),
  "lastImportStartedAt" TIMESTAMP(3),
  "lastImportError" TEXT
);

CREATE UNIQUE INDEX "TranslationSurface_projectId_slug_key" ON "TranslationSurface"("projectId", "slug");
CREATE UNIQUE INDEX "TranslationSurface_projectId_id_key" ON "TranslationSurface"("projectId", "id");
CREATE UNIQUE INDEX "Locale_projectId_surfaceId_code_key" ON "Locale"("projectId", "surfaceId", "code");
CREATE INDEX "StringKey_projectId_surfaceId_namespace_idx" ON "StringKey"("projectId", "surfaceId", "namespace");
CREATE INDEX "StringKey_projectId_surfaceId_orphaned_idx" ON "StringKey"("projectId", "surfaceId", "orphaned");
CREATE UNIQUE INDEX "StringKey_projectId_surfaceId_id_key" ON "StringKey"("projectId", "surfaceId", "id");
CREATE UNIQUE INDEX "StringKey_projectId_surfaceId_key_key" ON "StringKey"("projectId", "surfaceId", "key");
CREATE INDEX "Translation_projectId_surfaceId_localeCode_needsReview_idx" ON "Translation"("projectId", "surfaceId", "localeCode", "needsReview");
CREATE INDEX "Translation_projectId_surfaceId_updatedAt_idx" ON "Translation"("projectId", "surfaceId", "updatedAt");

INSERT INTO "TranslationSurface" ("id", "projectId", "slug", "adapterName", "pathTemplate", "nested", "nestedByPath", "baseLocale", "declaredBaseLocale", "lastCommitSha", "lastCommitAt", "lastImportStartedAt", "lastImportError")
SELECT 'surface-' || "id", "id", 'default', "adapterName", "pathTemplate", "nested", "nestedByPath", "baseLocale", "declaredBaseLocale", "lastCommitSha", "lastCommitAt", "lastImportStartedAt", "lastImportError" FROM "Project";
UPDATE "Project" SET "defaultSurfaceId" = 'surface-' || "id";
UPDATE "Locale" SET "surfaceId" = 'surface-' || "projectId";
UPDATE "StringKey" SET "surfaceId" = 'surface-' || "projectId";
UPDATE "Translation" SET "surfaceId" = 'surface-' || "projectId";

ALTER TABLE "Project" ADD CONSTRAINT "Project_id_defaultSurfaceId_fkey" FOREIGN KEY ("id", "defaultSurfaceId") REFERENCES "TranslationSurface"("projectId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "TranslationSurface" ADD CONSTRAINT "TranslationSurface_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Locale" ADD CONSTRAINT "Locale_projectId_surfaceId_fkey" FOREIGN KEY ("projectId", "surfaceId") REFERENCES "TranslationSurface"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StringKey" ADD CONSTRAINT "StringKey_projectId_surfaceId_fkey" FOREIGN KEY ("projectId", "surfaceId") REFERENCES "TranslationSurface"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_projectId_surfaceId_fkey" FOREIGN KEY ("projectId", "surfaceId") REFERENCES "TranslationSurface"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_projectId_surfaceId_keyId_fkey" FOREIGN KEY ("projectId", "surfaceId", "keyId") REFERENCES "StringKey"("projectId", "surfaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_projectId_surfaceId_localeCode_fkey" FOREIGN KEY ("projectId", "surfaceId", "localeCode") REFERENCES "Locale"("projectId", "surfaceId", "code") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
