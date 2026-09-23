import { describe, expect, it } from "vitest";
import { applySavedRow, mergeServerRows, savedOutCount, startListGeneration } from "../saved-rows";

/**
 * 저장 직후 목록 보존 (translation-rework T3 — spec §3.4 · §7 Saved 행 보존 · design §4).
 *
 * 저장은 목록 **멤버십·순서**를 바꾸지 않는다 — 조건에서 벗어난 행은 자리에 남아 취소선 + `Saved`가 되고,
 * 수만 최신 저장값으로 갱신된다. 보존은 **필터 세대**가 바뀔 때(필터·검색·범위·트리·새로고침) 끝난다.
 */
type Row = { keyId: string; missingCount: number };
const rows: Row[] = [{ keyId: "a", missingCount: 2 }, { keyId: "b", missingCount: 1 }, { keyId: "c", missingCount: 3 }];

describe("applySavedRow", () => {
  it("저장한 행을 같은 자리에서 최신 요약으로 바꾼다", () => {
    const list = applySavedRow(startListGeneration(rows, 1), { keyId: "b", row: { keyId: "b", missingCount: 0 }, matches: true });
    expect(list.rows.map(r => r.row)).toEqual([{ keyId: "a", missingCount: 2 }, { keyId: "b", missingCount: 0 }, { keyId: "c", missingCount: 3 }]);
    expect(savedOutCount(list)).toBe(0);
  });

  it("조건을 벗어난 행은 빠지지 않고 savedOut으로 남는다", () => {
    const list = applySavedRow(startListGeneration(rows, 1), { keyId: "b", row: { keyId: "b", missingCount: 0 }, matches: false });
    expect(list.rows.map(r => r.row.keyId)).toEqual(["a", "b", "c"]);
    expect(list.rows[1]).toEqual({ row: { keyId: "b", missingCount: 0 }, savedOut: true });
    expect(savedOutCount(list)).toBe(1);
  });

  it("다시 조건에 들어오면 savedOut 표시를 푼다", () => {
    const out = applySavedRow(startListGeneration(rows, 1), { keyId: "b", row: { keyId: "b", missingCount: 0 }, matches: false });
    const back = applySavedRow(out, { keyId: "b", row: { keyId: "b", missingCount: 1 }, matches: true });
    expect(savedOutCount(back)).toBe(0);
  });

  it("목록에 없는 키의 저장은 목록을 바꾸지 않는다 — 새 행을 끼워 넣지 않는다", () => {
    const list = startListGeneration(rows, 1);
    expect(applySavedRow(list, { keyId: "zzz", row: { keyId: "zzz", missingCount: 0 }, matches: true })).toEqual(list);
  });

  it("다른 세대의 늦은 저장 결과는 적용하지 않는다", () => {
    const list = startListGeneration(rows, 2);
    expect(applySavedRow(list, { keyId: "b", row: { keyId: "b", missingCount: 0 }, matches: false, generation: 1 })).toEqual(list);
  });
});

describe("startListGeneration — 세대가 바뀌면 보존이 끝난다", () => {
  it("새 세대는 savedOut 없이 시작한다", () => {
    const list = startListGeneration(rows, 3);
    expect(list.generation).toBe(3);
    expect(list.rows.every(r => !r.savedOut)).toBe(true);
  });
});

describe("mergeServerRows — 같은 세대의 재검증", () => {
  it("서버 목록에 남은 행은 새 요약으로 바꾸고, 빠진 행은 자리에 남아 savedOut이 된다", () => {
    const list = startListGeneration(rows, 1);
    const merged = mergeServerRows(list, [{ keyId: "a", missingCount: 1 }, { keyId: "c", missingCount: 0 }]);
    expect(merged.rows).toEqual([
      { row: { keyId: "a", missingCount: 1 }, savedOut: false },
      { row: { keyId: "b", missingCount: 1 }, savedOut: true },
      { row: { keyId: "c", missingCount: 0 }, savedOut: false },
    ]);
  });

  it("세대 시작 때 없던 행을 끼워 넣지 않는다 — 목록 멤버십은 재필터에서만 바뀐다", () => {
    const merged = mergeServerRows(startListGeneration(rows, 1), [...rows, { keyId: "z", missingCount: 9 }]);
    expect(merged.rows.map(r => r.row.keyId)).toEqual(["a", "b", "c"]);
  });

  it("다시 서버 목록에 들어오면 savedOut을 푼다", () => {
    const out = mergeServerRows(startListGeneration(rows, 1), [rows[0]!, rows[2]!]);
    expect(savedOutCount(mergeServerRows(out, rows))).toBe(0);
  });
});
