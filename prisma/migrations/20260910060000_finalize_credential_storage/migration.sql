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
-- ⚠️ **NOT NULL은 일부러 빼 뒀다** (2026-09-10 판단). 그 제약을 걸면 전환 도구의 backfill CAS가
-- 아직 안 채워진 행을 `emailLookup: null`로 집을 수 없게 되고(Prisma가 그 **입력**을 거부한다),
-- 컷오버 이전 백업을 복원했을 때 다시 채울 수단이 사라진다. 유일성은 R1의 unique 인덱스가 이미
-- 들고, 값 존재는 유일한 생성자인 `credentialAdapter.createUser`가 쓰기 전에 증명한다.
DROP INDEX "User_email_key";
DROP INDEX "ProjectInvitation_projectId_email_idx";
COMMIT;
