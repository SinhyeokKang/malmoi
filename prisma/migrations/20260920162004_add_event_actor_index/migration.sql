-- CreateIndex
CREATE INDEX "ProjectEvent_projectId_actorKind_actorUserId_idx" ON "ProjectEvent"("projectId", "actorKind", "actorUserId");
