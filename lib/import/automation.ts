import type { DeferReason, EventResult } from "@/lib/events/payload";
import { summarizeImportEvent } from "@/lib/events/view";

import type { RepositoryImportOutcome } from "./result";

/**
 * 야간 서버 적재(`runAutomationImport`)의 실패 분류 — **순수 판정**이다(nightly-sync, 2026-09-30 사용자 판정 "서버 전용 한도는 한 부류").
 *
 * 야간이 CI로 건강한 프로젝트를 Home에서 실패로 뒤집지 않는다(spec 6b의 이유). 그래서 셋으로 가른다:
 * - `hold` — **영구 서버 전용 한도**(파일 예산·트리 잘림). 사건 `deferred`·`too-large`, 표면 실패 상태를 안 쓴다.
 * - `transient` — **일시·자격 실패**(API 오류·rate limit·설치 토큰·내려받기). 사건만 `failed`, 표면 실패 상태를 안 쓴다.
 * - `record` — **CI도 같이 실패할 것**(파싱 실패·0키·base 브랜치 부재). 수동과 같이 `lastImportError`를 쓴다.
 *
 * ⚠️ 수동 Sync는 이 분류를 타지 않는다 — 사람이 누른 실행의 실패는 그 사람이 봐야 한다.
 */
export type AutomationFailureClass = "hold" | "transient" | "record";

export function classifySnapshotFailure(status: "truncated" | "base-branch-missing" | "unavailable"): AutomationFailureClass {
  if (status === "truncated") return "hold";
  if (status === "unavailable") return "transient";
  return "record";
}

export function classifySurfaceFailure(prepared: { error: "resource-limit" | "ingest-failed"; result: { errors: readonly { code: string }[] } }): AutomationFailureClass {
  if (prepared.error === "resource-limit") return "hold";
  // ⚠️ 빈 목록의 `every`는 참이다 — 오류 없는 실패(0키)는 CI도 같이 실패하므로 record다.
  const errors = prepared.result.errors;
  return errors.length > 0 && errors.every(error => error.code === "download-failed") ? "transient" : "record";
}

export type ImportEventSummary = {
  result: Extract<EventResult, "imported" | "partial" | "superseded" | "failed" | "deferred">;
  deferReason: Extract<DeferReason, "pending-edits" | "too-large"> | null;
};

/**
 * 종료 사건의 결과. 수동은 소스별 결과 그대로이고, 자동화만 보류 둘이 더해진다.
 *
 * @param halted 표면별 사후 재집계가 표면을 롤백하고 루프를 멈췄다 — 앞 표면이 적재됐으면 `partial`, 아니면 `deferred(pending-edits)`.
 *   ⚠️ 멈춘 표면은 결과 목록에 없으므로 나머지가 전부 `imported`여도 `partial`이다 — `summarizeImportEvent`에 맡기면 성공으로 접힌다.
 * @param held 스냅샷이 서버 한도(`truncated`)에 걸렸다.
 *
 * ⚠️ `too-large`는 **모든 표면이 한도 보류일 때만**이다 — 파싱 실패가 섞이면 `failed`, 적재가 섞이면 `partial`로 소스별 결과에 맡긴다.
 */
export function summarizeRun(input: { automation: boolean; outcome: RepositoryImportOutcome; halted: boolean; held: boolean }): ImportEventSummary {
  const { outcome } = input;
  if (input.automation && input.held) return { result: "deferred", deferReason: "too-large" };
  if (!outcome.ok) return { result: "failed", deferReason: null };
  if (input.automation) {
    const applied = outcome.surfaces.some(surface => surface.status === "imported" || surface.status === "partial");
    if (input.halted) return applied ? { result: "partial", deferReason: null } : { result: "deferred", deferReason: "pending-edits" };
    if (outcome.surfaces.length > 0 && outcome.surfaces.every(surface => surface.reason === "resource-limit")) return { result: "deferred", deferReason: "too-large" };
  }
  return { result: summarizeImportEvent(outcome.surfaces), deferReason: null };
}
