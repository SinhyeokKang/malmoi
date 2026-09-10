-- R2 ONLY: stage under prisma/migrations only after blocked backfill + authenticated verification.
BEGIN;
LOCK TABLE "User", "ProjectInvitation", "Account", "Session" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "emailLookup" IS NULL OR "email" NOT LIKE 'enc:v1:%'
    OR ("name" IS NOT NULL AND "name" NOT LIKE 'enc:v1:%') OR ("image" IS NOT NULL AND "image" NOT LIKE 'enc:v1:%'))
    OR EXISTS (SELECT 1 FROM "ProjectInvitation" WHERE "emailLookup" IS NULL OR "email" NOT LIKE 'enc:v1:%')
    OR EXISTS (SELECT 1 FROM "Session" WHERE "sessionToken" !~ '^sha256:v1:[a-f0-9]{64}$')
    OR EXISTS (SELECT 1 FROM "Account" WHERE "provider" IN ('github', 'google') AND ("access_token" IS NOT NULL OR "refresh_token" IS NOT NULL OR "id_token" IS NOT NULL))
    OR EXISTS (SELECT 1 FROM "Account" WHERE "provider" = 'github-app' AND (("access_token" IS NOT NULL AND "access_token" NOT LIKE 'enc:v1:%') OR ("refresh_token" IS NOT NULL AND "refresh_token" NOT LIKE 'enc:v1:%') OR "id_token" IS NOT NULL))
  THEN RAISE EXCEPTION 'credential finalization precondition failed'; END IF;
END $$;
ALTER TABLE "User" ALTER COLUMN "emailLookup" SET NOT NULL;
ALTER TABLE "ProjectInvitation" ALTER COLUMN "emailLookup" SET NOT NULL;
DROP INDEX "User_email_key";
DROP INDEX "ProjectInvitation_projectId_email_idx";
COMMIT;
