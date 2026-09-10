-- Preparation only. Plaintext indexes remain until the blocked credential cutover.
ALTER TABLE "User" ADD COLUMN "emailLookup" TEXT;
ALTER TABLE "ProjectInvitation" ADD COLUMN "emailLookup" TEXT;
CREATE UNIQUE INDEX "User_emailLookup_key" ON "User"("emailLookup");
CREATE INDEX "ProjectInvitation_projectId_emailLookup_idx" ON "ProjectInvitation"("projectId", "emailLookup");
