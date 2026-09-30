import { importFailureTone, isImportFailureCode } from "@/lib/projects/import-failure";
import { STATE, type StateKey, type StateTone } from "@/lib/status/canon";

/**
 * 표면 하나의 적재 상태 — Sources 행 칸·배지·상세 칸·상세 보조줄이 전부 이 값을 읽는다(ux-drift-unify §3.5).
 *
 * - `labelKey` — 상태 키(`lib/status/canon.ts`의 `STATE`). 화면은 키만 넘기고 낱말·variant를 고르지 않는다. 실패의 갈래는
 *   `importFailureTone` 경유다 — 일부 반영(`partial-import`)은 데이터가 들어간 상태라 호박 Partially synced이고(🔴 A1) 화면이
 *   `"partial-import"`를 따로 비교하지 않는다.
 * - `tone` — `STATE[labelKey].tone`이다. 여기서 따로 고르지 않는다.
 * - `at` — 성공 시각은 **적재 시각(`lastImportedAt`)**이다. 커밋 시각을 쓰면 오래된 커밋을 방금 적재한 표면이 "13 days ago"로
 *   읽힌다(`lib/home/sync-time.ts`가 금지한 쪽 — malmoi#81). 시각 컬럼 이전의 성공은 `null`이고 커밋 시각으로 메우지 않는다.
 */
export type SurfaceImportStatus = {
  state: "not-imported" | "importing" | "failed-first" | "failed-after" | "imported";
  tone: StateTone;
  labelKey: Extract<StateKey, "notSyncedYet" | "syncing" | "syncFailed" | "partiallySynced" | "synced">;
  canRetry: boolean;
  at: Date | null;
};

export function planSurfaceImportStatus(surface: {
  lastCommitSha: string | null;
  lastImportStartedAt: Date | null;
  lastImportError: string | null;
  lastImportFailedAt: Date | null;
  lastImportedAt: Date | null;
}): SurfaceImportStatus {
  const status = (state: SurfaceImportStatus["state"], labelKey: SurfaceImportStatus["labelKey"], canRetry: boolean, at: Date | null): SurfaceImportStatus =>
    ({ state, tone: STATE[labelKey].tone, labelKey, canRetry, at });
  // 이전 실패보다 진행 중 표시가 먼저다. SHA만이 첫 적재 완료의 증거다.
  if (surface.lastImportStartedAt !== null) return status("importing", "syncing", false, surface.lastImportStartedAt);
  const imported = surface.lastCommitSha !== null;
  if (isImportFailureCode(surface.lastImportError)) {
    const labelKey = importFailureTone(surface.lastImportError) === "warning" ? "partiallySynced" : "syncFailed";
    return status(imported ? "failed-after" : "failed-first", labelKey, !imported, surface.lastImportFailedAt);
  }
  return imported ? status("imported", "synced", false, surface.lastImportedAt) : status("not-imported", "notSyncedYet", true, null);
}
