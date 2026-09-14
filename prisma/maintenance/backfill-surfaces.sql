-- Deployment 1 only: stop/drain old writers, run this, then enable new writers.
-- Never run after phase B or after users start editing Surface settings.
BEGIN;
LOCK TABLE "Project", "TranslationSurface", "Locale", "StringKey", "Translation" IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "TranslationSurface" s JOIN "Project" p ON p.id = s."projectId"
    WHERE s.slug <> 'default' OR s."lastCommitAt" > p."lastCommitAt"
      OR (s."lastCommitAt" IS NOT NULL AND p."lastCommitAt" IS NULL)) THEN
    RAISE EXCEPTION 'precondition failed: new surface writers already active';
  END IF;
END $$;
INSERT INTO "TranslationSurface" (id, "projectId", slug)
SELECT 'surface-' || id, id, 'default' FROM "Project" p
WHERE NOT EXISTS (SELECT 1 FROM "TranslationSurface" s WHERE s."projectId" = p.id AND s.slug = 'default');
UPDATE "TranslationSurface" s SET
  "adapterName" = p."adapterName", "pathTemplate" = p."pathTemplate", "nested" = p."nested",
  "nestedByPath" = p."nestedByPath", "baseLocale" = p."baseLocale", "declaredBaseLocale" = p."declaredBaseLocale",
  "lastCommitSha" = p."lastCommitSha", "lastCommitAt" = p."lastCommitAt",
  "lastImportStartedAt" = p."lastImportStartedAt", "lastImportError" = p."lastImportError"
FROM "Project" p WHERE s."projectId" = p.id AND s.slug = 'default';
UPDATE "Project" p SET "defaultSurfaceId" = s.id FROM "TranslationSurface" s
WHERE s."projectId" = p.id AND s.slug = 'default' AND p."defaultSurfaceId" IS NULL;
UPDATE "Locale" c SET "surfaceId" = p."defaultSurfaceId" FROM "Project" p WHERE c."projectId" = p.id AND c."surfaceId" IS NULL;
UPDATE "StringKey" c SET "surfaceId" = p."defaultSurfaceId" FROM "Project" p WHERE c."projectId" = p.id AND c."surfaceId" IS NULL;
UPDATE "Translation" c SET "surfaceId" = p."defaultSurfaceId" FROM "Project" p WHERE c."projectId" = p.id AND c."surfaceId" IS NULL;
COMMIT;
