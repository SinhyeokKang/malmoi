import { describe, expect, it } from "vitest";

import type { RepositoryImportOutcome, SurfaceImportResult } from "../result";
import { classifySnapshotFailure, classifySurfaceFailure, summarizeRun } from "../automation";

/**
 * 야간 서버 적재의 실패 분류 (nightly-sync — 2026-09-30 사용자 판정 "서버 전용 한도는 한 부류"). 야간이 CI로 건강한 프로젝트를 Home에서
 * 실패로 뒤집지 않는다: **영구 한도는 보류(`too-large`)**, **일시·자격 실패는 사건만 실패**, CI도 같이 실패할 것만 표면 실패 상태를 쓴다.
 */
describe("classifySnapshotFailure", () => {
  it("truncated → hold (영구 서버 한도)", () => expect(classifySnapshotFailure("truncated")).toBe("hold"));
  it("unavailable → transient (API 오류·rate limit·5xx)", () => expect(classifySnapshotFailure("unavailable")).toBe("transient"));
  it("base-branch-missing → record (경합으로만 온다 — CI도 같다)", () => expect(classifySnapshotFailure("base-branch-missing")).toBe("record"));
});

describe("classifySurfaceFailure", () => {
  const failed = (error: "resource-limit" | "ingest-failed", codes: string[]) => ({ error, result: { errors: codes.map(code => ({ path: "p", code })) } });
  it("resource-limit → hold", () => expect(classifySurfaceFailure(failed("resource-limit", []))).toBe("hold"));
  it("내려받기 실패만 → transient", () => expect(classifySurfaceFailure(failed("ingest-failed", ["download-failed", "download-failed"]))).toBe("transient"));
  it("파싱 실패가 섞이면 record — CI도 같은 파일에서 실패한다", () => expect(classifySurfaceFailure(failed("ingest-failed", ["download-failed", "invalid-json"]))).toBe("record"));
  it("오류 목록이 비었으면(0키) record — 빈 목록의 every가 transient로 새지 않는다", () => expect(classifySurfaceFailure(failed("ingest-failed", []))).toBe("record"));
});

const surface = (status: SurfaceImportResult["status"], reason: SurfaceImportResult["reason"] = null): SurfaceImportResult =>
  ({ surfaceSlug: "s", status, reason, count: 0, failed: status === "failed" ? 1 : 0, unmanaged: 0, errors: [] });
const ok = (...surfaces: SurfaceImportResult[]): RepositoryImportOutcome => ({ ok: true, surfaces, remainingEdits: 0 });
const auto = (outcome: RepositoryImportOutcome, over: { halted?: boolean; held?: boolean } = {}) =>
  summarizeRun({ automation: true, outcome, halted: over.halted ?? false, held: over.held ?? false });

describe("summarizeRun — 자동화", () => {
  it("스냅샷 한도(held) → deferred too-large", () => {
    expect(auto({ ok: false, error: "tree-truncated" }, { held: true })).toEqual({ result: "deferred", deferReason: "too-large" });
  });
  it("모든 표면이 한도 보류 → deferred too-large", () => {
    expect(auto(ok(surface("failed", "resource-limit"), surface("failed", "resource-limit")))).toEqual({ result: "deferred", deferReason: "too-large" });
  });
  it("한도 보류 + 파싱 실패 → failed (보류로 접지 않는다)", () => {
    expect(auto(ok(surface("failed", "resource-limit"), surface("failed", "import-failed")))).toEqual({ result: "failed", deferReason: null });
  });
  it("한도 보류 + 적재 → partial", () => {
    expect(auto(ok(surface("failed", "resource-limit"), surface("imported")))).toEqual({ result: "partial", deferReason: null });
  });
  it("재집계로 멈춤 — 앞 표면 적재면 partial, 아니면 deferred pending-edits", () => {
    expect(auto(ok(surface("imported")), { halted: true })).toEqual({ result: "partial", deferReason: null });
    expect(auto(ok(), { halted: true })).toEqual({ result: "deferred", deferReason: "pending-edits" });
  });
  it("실패 반환 → failed", () => expect(auto({ ok: false, error: "unavailable" })).toEqual({ result: "failed", deferReason: null }));
  it("표면 0개는 too-large가 아니다", () => expect(auto(ok())).toEqual({ result: "failed", deferReason: null }));
});

describe("summarizeRun — 수동은 보류가 없다", () => {
  it("한도만 있어도 failed, held를 줘도 무시한다", () => {
    expect(summarizeRun({ automation: false, outcome: ok(surface("failed", "resource-limit")), halted: false, held: false })).toEqual({ result: "failed", deferReason: null });
    expect(summarizeRun({ automation: false, outcome: { ok: false, error: "tree-truncated" }, halted: false, held: true })).toEqual({ result: "failed", deferReason: null });
  });
});
