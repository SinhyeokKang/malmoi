import { canPerform, type Role } from "@/lib/auth/permission";
import { planSurfaceImportStatus } from "@/lib/import/surface-status";
import { planSurfaceReadiness } from "@/lib/onboarding/readiness";

export function planSourceActions(input: Parameters<typeof planSurfaceImportStatus>[0] & {
  role: Role; archived: boolean; installed: boolean; pending: boolean;
}) {
  const canEdit = canPerform(input.role, "project:settings") && !input.archived;
  const status = planSurfaceImportStatus(input);
  // 클라이언트에는 연결 식별자 대신 존재 여부만 전달한다(`installed` = 연결 증거가 있다 — GitHub 설치·GitLab 연결 참조).
  const readiness = planSurfaceReadiness({ connected: input.installed, surface: input });
  return {
    canEdit,
    canRetry: canEdit && !input.pending && status.canRetry && readiness === "awaiting_first_sync",
    canOpen: !input.archived && !input.pending && readiness === "ready",
  };
}
