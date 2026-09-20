import { isImportFailureCode } from "@/lib/projects/import-failure";

export function planSurfaceImportStatus(surface: {
  lastCommitSha: string | null;
  lastImportStartedAt: Date | null;
  lastImportError: string | null;
  lastImportFailedAt: Date | null;
  lastCommitAt: Date | null;
}): { state: "not-imported" | "importing" | "failed-first" | "failed-after" | "imported"; canRetry: boolean; at: Date | null } {
  // 이전 실패보다 진행 중 표시가 먼저다. SHA만이 첫 적재 완료의 증거다.
  if (surface.lastImportStartedAt !== null) return { state: "importing", canRetry: false, at: surface.lastImportStartedAt };
  const imported = surface.lastCommitSha !== null;
  if (isImportFailureCode(surface.lastImportError)) return { state: imported ? "failed-after" : "failed-first", canRetry: !imported, at: surface.lastImportFailedAt };
  return { state: imported ? "imported" : "not-imported", canRetry: !imported, at: imported ? surface.lastCommitAt : null };
}
