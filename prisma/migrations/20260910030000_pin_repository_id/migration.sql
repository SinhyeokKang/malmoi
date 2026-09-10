-- Existing projects remain unpinned and cannot publish until an OWNER reconnects.
ALTER TABLE "Project" ADD COLUMN "repositoryId" TEXT;
