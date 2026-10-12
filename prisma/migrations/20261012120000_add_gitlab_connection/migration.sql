-- gitlab-repositories B1. Additive only: existing Project rows are GitHub via the column default (no app-code backfill — self-hosted installs skip versions).
-- No GRANT for the new credential table: the public schema USAGE revocation covers it (verify has_schema_privilege after applying).

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "gitlabConnectionId" TEXT,
ADD COLUMN     "repoHost" TEXT NOT NULL DEFAULT 'github';

-- CreateTable
CREATE TABLE "GitLabConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "gitlabUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitLabConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitLabConnection_userId_key" ON "GitLabConnection"("userId");

-- CreateIndex
CREATE INDEX "Project_gitlabConnectionId_idx" ON "Project"("gitlabConnectionId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_gitlabConnectionId_fkey" FOREIGN KEY ("gitlabConnectionId") REFERENCES "GitLabConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitLabConnection" ADD CONSTRAINT "GitLabConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

