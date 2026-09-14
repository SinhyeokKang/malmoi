BEGIN;
LOCK TABLE "Project", "TranslationSurface", "Locale", "StringKey", "Translation" IN ACCESS EXCLUSIVE MODE;
-- 새 writer는 Project에 dual-write하지 않는다. 옛 값을 복사하지 말고 불일치에서 멈춘다.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Locale" WHERE "surfaceId" IS NULL)
    OR EXISTS (SELECT 1 FROM "StringKey" WHERE "surfaceId" IS NULL)
    OR EXISTS (SELECT 1 FROM "Translation" WHERE "surfaceId" IS NULL)
    OR EXISTS (SELECT 1 FROM "Project" p WHERE p."defaultSurfaceId" IS NULL
      OR (SELECT count(*) FROM "TranslationSurface" s
          WHERE s."projectId" = p.id AND s.id = p."defaultSurfaceId" AND s."archivedAt" IS NULL) <> 1)
  THEN RAISE EXCEPTION 'precondition failed: surface ownership is incomplete'; END IF;
END $$;
-- DropForeignKey
ALTER TABLE "Translation" DROP CONSTRAINT "Translation_projectId_keyId_fkey";

-- DropForeignKey
ALTER TABLE "Translation" DROP CONSTRAINT "Translation_projectId_localeCode_fkey";

-- 표면 FK가 옛 unique index에 종속돼 있어 PK 교체 전 잠시 떼고 같은 트랜잭션에서 복원한다.
ALTER TABLE "Translation" DROP CONSTRAINT "Translation_projectId_surfaceId_localeCode_fkey";
DROP INDEX "Locale_projectId_surfaceId_code_key";

-- DropIndex
DROP INDEX "StringKey_projectId_id_key";

-- DropIndex
DROP INDEX "StringKey_projectId_key_key";

-- AlterTable
ALTER TABLE "Locale" DROP CONSTRAINT "Locale_pkey",
ALTER COLUMN "surfaceId" SET NOT NULL,
ADD CONSTRAINT "Locale_pkey" PRIMARY KEY ("projectId", "surfaceId", "code");

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "adapterName",
DROP COLUMN "baseLocale",
DROP COLUMN "declaredBaseLocale",
DROP COLUMN "lastCommitAt",
DROP COLUMN "lastCommitSha",
DROP COLUMN "lastImportError",
DROP COLUMN "lastImportStartedAt",
DROP COLUMN "nested",
DROP COLUMN "nestedByPath",
DROP COLUMN "pathTemplate";

-- AlterTable
ALTER TABLE "StringKey" ALTER COLUMN "surfaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Translation" ALTER COLUMN "surfaceId" SET NOT NULL;

ALTER TABLE "Translation" ADD CONSTRAINT "Translation_projectId_surfaceId_localeCode_fkey"
  FOREIGN KEY ("projectId", "surfaceId", "localeCode") REFERENCES "Locale"("projectId", "surfaceId", "code")
  ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
