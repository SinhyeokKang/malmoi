import { describe, expect, it } from "vitest";
import { summarizeImport, type SurfaceImportResult } from "../result";
const row = (status: SurfaceImportResult["status"], over: Partial<SurfaceImportResult> = {}): SurfaceImportResult => ({ surfaceSlug: "default", status, count: 0, failed: 0, reason: null, errors: [], ...over });

describe("summarizeImport", () => {
  it("정상 0키도 성공 재적재다", () => {
    expect(summarizeImport([row("imported")])).toEqual({ tone: "success", keys: 0, imported: 1, partial: 0, unreadable: [], superseded: [], invalidFormat: [] });
  });
  it.each([
    [["partial"], "warning"], [["imported", "partial"], "warning"], [["failed"], "danger"],
    [["failed", "superseded"], "danger"], [["superseded"], "warning"], [["partial", "failed"], "warning"],
  ] as const)("%j의 tone은 %s다", (statuses, tone) => expect(summarizeImport(statuses.map(status => row(status))).tone).toBe(tone));
  it("읽기 실패·CI 미적용·포맷 오류 목록을 분리하고 원결과를 보존한다", () => {
    const rows = [row("failed", { surfaceSlug: "z", reason: "import-failed", errors: [{ path: "ko.json", code: "parse-failed" }] }), row("superseded", { surfaceSlug: "b", reason: "lease-lost" }), row("failed", { surfaceSlug: "a", reason: "invalid-format" }), row("imported", { surfaceSlug: "ok", count: 10 })];
    const before = structuredClone(rows);
    expect(summarizeImport(rows)).toEqual({ tone: "warning", keys: 10, imported: 1, partial: 0, unreadable: ["z"], superseded: ["b"], invalidFormat: ["a"] });
    expect(rows).toEqual(before);
  });
  it("목록은 localeCompare 대신 코드 유닛 순이다", () => {
    expect(summarizeImport(["z", "a", "A"].map(surfaceSlug => row("failed", { surfaceSlug }))).unreadable).toEqual(["A", "a", "z"]);
  });
  it("빈 결과를 전체 성공으로 접지 않는다", () => expect(summarizeImport([]).tone).toBe("danger"));
});
