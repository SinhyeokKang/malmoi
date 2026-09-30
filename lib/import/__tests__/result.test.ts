import { describe, expect, it } from "vitest";
import { summarizeImportEvent, TONES } from "@/lib/events/view";
import { importRevalidates, summarizeImport, type SurfaceImportResult } from "../result";
const row = (status: SurfaceImportResult["status"], over: Partial<SurfaceImportResult> = {}): SurfaceImportResult => ({ surfaceSlug: "default", status, count: 0, failed: 0, unmanaged: 0, reason: null, errors: [], ...over });

describe("summarizeImport", () => {
  it("정상 0키도 성공 재적재다", () => {
    expect(summarizeImport([row("imported")])).toEqual({ tone: "success", keys: 0, imported: 1, partial: 0, unreadable: [], superseded: [], invalidFormat: [] });
  });
  it.each([
    [["partial"], "warning"], [["imported", "partial"], "warning"], [["failed"], "danger"],
    // 전 표면 superseded는 실패가 아니라 밀림이다 — Logs와 같은 muted(ux-drift-unify 🔴 B). 전에는 이 줄이 warning을 고정했다.
    [["failed", "superseded"], "danger"], [["superseded"], "muted"], [["partial", "failed"], "warning"],
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

/**
 * **Home의 Sync 결과 톤 = Logs의 결과 톤** (ux-drift-unify 🔴 B · §3.4). 전 표면 superseded가 Home에선 호박 "Sync could not finish",
 * Logs에선 회색 Superseded였다. 톤은 결과 어휘(`summarizeImportEvent`) → `TONES` 한 길로만 나온다.
 *
 * ⚠️ **입력은 `finishSurface`가 실제로 돌려주는 모양만이다** (POSTMORTEM 2026-09-16) — `partial`은 `reason`이 언제나 null이고,
 * `failed`·`superseded`만 사유를 단다(`superseded`/`lease-lost`). 서버가 만들지 않는 조합으로 합치를 재면 공허하다.
 */
describe("summarizeImport.tone = TONES[summarizeImportEvent]", () => {
  const ATOMS: readonly SurfaceImportResult[] = [
    row("imported", { count: 3 }),
    row("partial", { count: 2, failed: 1, errors: [{ path: "ko.json", code: "parse-failed" }] }),
    row("failed", { reason: "import-failed", errors: [{ path: "ko.json", code: "parse-failed" }] }),
    row("failed", { reason: "invalid-format" }),
    row("superseded", { reason: "superseded" }),
    row("superseded", { reason: "lease-lost" }),
  ];
  // 표면 1~3개의 모든 조합(중복 포함) — 일부 superseded + 일부 partial 같은 섞임이 여기서 전부 나온다.
  const combos: SurfaceImportResult[][] = [[]];
  for (const a of ATOMS) {
    combos.push([a]);
    for (const b of ATOMS) {
      combos.push([a, b]);
      for (const c of ATOMS) combos.push([a, b, c]);
    }
  }

  it.each(combos.map((combo, index) => [index, combo.map(r => `${r.status}${r.reason ? `:${r.reason}` : ""}`).join("+") || "(empty)", combo] as const))(
    "#%i %s", (_index, _label, combo) => {
      expect(summarizeImport(combo).tone).toBe(TONES[summarizeImportEvent(combo)]);
    });

  it("일부 superseded + 일부 partial은 warning이다(partial)", () => {
    expect(summarizeImport([row("superseded", { reason: "superseded" }), row("partial", { count: 1, failed: 1 })]).tone).toBe("warning");
  });
});

/**
 * **어느 Sync 결과가 재검증 트리를 싣고 오나** (malmoi#103 r1). `runRepositoryImport`의 `finally`가 `revalidatePath`를 부르므로
 * `try` 안의 거부(`reconfirm`·`already-running`·`not-ready`…)도 새 트리가 온다 — 그 트리를 기다려야 교차 잠금이 옛 수치로 안 풀린다.
 * `try` 앞의 거부만 트리가 없다. 클라이언트가 접은 throw(`unconfirmed`)는 서버가 끝냈는지 모르므로 `SyncButton`이 refresh로 트리를
 * 부른다 — 그 트리를 기다려야 Publish가 Sync가 버렸을지 모를 편집으로 켜지지 않는다 (malmoi#132).
 */
describe("importRevalidates", () => {
  it.each(["reconfirm", "already-running", "not-ready", "not-connected", "repo-replaced", "ingest-failed", "no-surfaces"] as const)("try 안의 거부 %s는 트리가 온다", error => {
    expect(importRevalidates({ ok: false, error })).toBe(true);
  });
  it.each(["invalid input", "unauthorized", "forbidden", "unavailable", "not-found", "archived"] as const)("try 앞의 거부 %s는 트리가 없다", error => {
    expect(importRevalidates({ ok: false, error })).toBe(false);
  });
  it("응답을 잃은 실행(unconfirmed)은 refresh 트리를 기다린다 (malmoi#132)", () => { expect(importRevalidates({ ok: false, error: "unconfirmed" })).toBe(true); });
  it("성공은 트리가 온다", () => { expect(importRevalidates({ ok: true, surfaces: [], remainingEdits: 0 })).toBe(true); });
});
