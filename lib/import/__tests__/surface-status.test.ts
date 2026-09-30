import { expect, it } from "vitest";
import { planSurfaceImportStatus } from "../surface-status";
import { IMPORT_FAILURE_CODES, importFailureTone } from "@/lib/projects/import-failure";
const at = new Date("2026-09-20T00:00:00Z");
const commit = new Date("2026-09-01T00:00:00Z");
const base = { lastCommitSha: null, lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportedAt: null };
/**
 * ⚠️ **성공 시각은 적재 시각(`lastImportedAt`)이다 — 커밋 시각이 아니다** (ux-drift-unify 6-Y8 · malmoi#81). 오래된 커밋을 방금 적재한 표면이
 * "13 days ago"로 읽혔다(`lib/home/sync-time.ts`가 금지한 쪽). 전에는 이 테스트가 `lastCommitAt → at`을 고정했다.
 */
it("未적재와 성공을 SHA로만 가르고 시각은 적재 시각이다", () => {
  expect(planSurfaceImportStatus(base)).toEqual({ state: "not-imported", tone: "muted", labelKey: "notSyncedYet", canRetry: true, at: null });
  // 실제 행은 커밋 시각도 함께 든다 — 그것을 무시하는지 본다.
  const withCommit = { ...base, lastCommitSha: "sha", lastImportedAt: at, lastCommitAt: commit };
  expect(planSurfaceImportStatus(withCommit)).toEqual({ state: "imported", tone: "success", labelKey: "synced", canRetry: false, at });
  // 시각 컬럼 이전의 성공 — 커밋 시각으로 메우지 않는다.
  const unrecorded = { ...base, lastCommitSha: "sha", lastCommitAt: commit };
  expect(planSurfaceImportStatus(unrecorded).at).toBeNull();
});
it("동기화 중은 무색이고 시작 시각을 든다", () => {
  expect(planSurfaceImportStatus({ ...base, lastImportStartedAt: at })).toEqual({ state: "importing", tone: "muted", labelKey: "syncing", canRetry: false, at });
});
/**
 * ⚠️ **일부 반영(`partial-import`)은 실패가 아니다** (ux-drift-unify 🔴 A1) — 데이터가 들어간 상태라 호박 "Partially synced"다.
 * 톤은 `importFailureTone` 경유다 — 화면이 `"partial-import"`를 따로 비교하지 않는다.
 */
it.each(IMPORT_FAILURE_CODES)("오류 %s는 SHA 유무에 따라 첫 실패와 후속 실패를 가르고 톤은 importFailureTone이다", error => {
  const tone = importFailureTone(error);
  const labelKey = tone === "warning" ? "partiallySynced" : "syncFailed";
  for (const sha of [null, "sha"]) for (const failedAt of [null, at]) {
    expect(planSurfaceImportStatus({ ...base, lastCommitSha: sha, lastImportError: error, lastImportFailedAt: failedAt })).toEqual({ state: sha === null ? "failed-first" : "failed-after", tone, labelKey, canRetry: sha === null, at: failedAt });
    expect(planSurfaceImportStatus({ ...base, lastCommitSha: sha, lastImportError: error, lastImportStartedAt: at })).toMatchObject({ state: "importing", tone: "muted", labelKey: "syncing", canRetry: false, at });
  }
});
it("partial은 warning, 나머지 실패는 danger다", () => {
  expect(planSurfaceImportStatus({ ...base, lastCommitSha: "sha", lastImportError: "partial-import" })).toMatchObject({ tone: "warning", labelKey: "partiallySynced" });
  expect(planSurfaceImportStatus({ ...base, lastCommitSha: "sha", lastImportError: "import-failed" })).toMatchObject({ tone: "danger", labelKey: "syncFailed" });
});
it.each(["unknown", "constructor", "__proto__"])("미지 오류 %s는 실패로 읽지 않는다", lastImportError => {
  expect(planSurfaceImportStatus({ ...base, lastImportError }).state).toBe("not-imported");
  expect(planSurfaceImportStatus({ ...base, lastImportError, lastCommitSha: "sha" }).state).toBe("imported");
});
