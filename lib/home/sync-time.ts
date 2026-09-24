/**
 * Home의 "마지막 Sync" 시각 (malmoi#81). **`lastImportedAt`(마지막 성공 적재)의 최댓값이다 — `lastCommitAt`이 아니다.**
 * 커밋 시각을 쓰면 오래된 커밋을 방금 적재한 프로젝트가 "13 days ago"로 읽힌다(ARCHITECTURE의 `lastImportedAt` 절이
 * 반대 방향의 같은 함정을 적어 둔다).
 *
 * ⚠️ **`"unrecorded"`는 `null`과 다른 사실이다** — 적재는 됐는데(`lastCommitAt`이 있다) 시각 컬럼 이전의 성공이라
 * 시각이 없다. backfill이 없으므로 그 자리를 커밋 시각으로 메우지 않고, 읽는 쪽이 시각 없이 말한다.
 */
export type SyncTime = Date | null | "unrecorded";

export function lastSyncTime(surfaces: readonly { lastImportedAt: Date | null; lastCommitAt: Date | null }[]): SyncTime {
  const latest = surfaces
    .map((s) => s.lastImportedAt)
    .filter((at): at is Date => at !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (latest !== undefined) return latest;
  return surfaces.some((s) => s.lastCommitAt !== null) ? "unrecorded" : null;
}
