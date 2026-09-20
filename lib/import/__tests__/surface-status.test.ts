import { expect, it } from "vitest";
import { planSurfaceImportStatus } from "../surface-status";
import { IMPORT_FAILURE_CODES } from "@/lib/projects/import-failure";
const at = new Date("2026-09-20T00:00:00Z");
const base = { lastCommitSha: null, lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastCommitAt: null };
it("未적재와 성공을 SHA로만 가르고 시각을 꾸미지 않는다", () => {
  expect(planSurfaceImportStatus(base)).toEqual({ state: "not-imported", canRetry: true, at: null });
  expect(planSurfaceImportStatus({ ...base, lastCommitSha: "sha", lastCommitAt: at })).toEqual({ state: "imported", canRetry: false, at });
  expect(planSurfaceImportStatus({ ...base, lastCommitSha: "sha" }).at).toBeNull();
});
it.each(IMPORT_FAILURE_CODES)("오류 %s는 SHA 유무에 따라 첫 실패와 후속 실패를 가른다", error => {
  for (const sha of [null, "sha"]) for (const failedAt of [null, at]) {
    expect(planSurfaceImportStatus({ ...base, lastCommitSha: sha, lastImportError: error, lastImportFailedAt: failedAt })).toEqual({ state: sha === null ? "failed-first" : "failed-after", canRetry: sha === null, at: failedAt });
    expect(planSurfaceImportStatus({ ...base, lastCommitSha: sha, lastImportError: error, lastImportStartedAt: at })).toEqual({ state: "importing", canRetry: false, at });
  }
});
it.each(["unknown", "constructor", "__proto__"])("미지 오류 %s는 실패로 읽지 않는다", lastImportError => {
  expect(planSurfaceImportStatus({ ...base, lastImportError }).state).toBe("not-imported");
  expect(planSurfaceImportStatus({ ...base, lastImportError, lastCommitSha: "sha" }).state).toBe("imported");
});
