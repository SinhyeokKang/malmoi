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

  it("전체 목록 재검증: 서버 목록에 없는 비선택 행도 savedOut이다 — 목록이 전량이라 부재가 곧 조건 이탈이다 (translation-filter-scope T6)", () => {
    const merged = mergeServerRows(startListGeneration(rows, 1), [rows[0]!]);
    expect(merged.rows.map(r => [r.row.keyId, r.savedOut])).toEqual([["a", false], ["b", true], ["c", true]]);
  });

  it("다시 서버 목록에 들어오면 savedOut을 푼다", () => {
    const out = mergeServerRows(startListGeneration(rows, 1), [rows[0]!, rows[2]!]);
    expect(savedOutCount(mergeServerRows(out, rows))).toBe(0);
  });
});

/**
 * #157 — 키 클릭·저장 뒤 재검증마다 서버가 전량 목록을 새 객체로 다시 보낸다. 값이 같은 행까지 새 객체로 바꾸면 `KeyRow`의 memo가
 * 한 행도 막지 못해 5,000행이 매번 다시 렌더된다(QA3 실측: 클릭당 행 렌더 3,626회). 값이 같으면 이전 참조를 그대로 둔다.
 */
describe("mergeServerRows — 값이 같은 행은 이전 참조를 재사용한다 (#157)", () => {
  type Full = { keyId: string; missingCount: number; match?: { field: string; text: string; start: number } };
  const base: Full[] = [
    { keyId: "a", missingCount: 2, match: { field: "key", text: "a", start: 0 } },
    { keyId: "b", missingCount: 1 },
    { keyId: "c", missingCount: 3 },
  ];
  const copy = (rows: Full[]): Full[] => rows.map(r => JSON.parse(JSON.stringify(r)) as Full);

  it("전부 같으면 목록 객체 자체를 그대로 돌려준다", () => {
    const list = startListGeneration(base, 1);
    expect(mergeServerRows(list, copy(base))).toBe(list);
  });

  it("바뀐 행만 새 객체이고 나머지 entry·row는 같은 참조다", () => {
    const list = startListGeneration(base, 1);
    const server = copy(base);
    server[1] = { keyId: "b", missingCount: 0 };
    const merged = mergeServerRows(list, server);
    expect(merged).not.toBe(list);
    expect(merged.rows[0]).toBe(list.rows[0]);
    expect(merged.rows[2]).toBe(list.rows[2]);
    expect(merged.rows[1]).toEqual({ row: { keyId: "b", missingCount: 0 }, savedOut: false });
  });

  it("중첩 값(match)까지 비교한다 — 같으면 재사용, 다르면 새 객체", () => {
    const list = startListGeneration(base, 1);
    const same = mergeServerRows(list, copy(base));
    expect(same.rows[0]).toBe(list.rows[0]);
    const server = copy(base);
    server[0] = { ...server[0]!, match: { field: "key", text: "a", start: 1 } };
    expect(mergeServerRows(list, server).rows[0]).not.toBe(list.rows[0]);
  });

  it("필드가 사라지거나 생겨도 다른 행이다", () => {
    const list = startListGeneration(base, 1);
    const server = copy(base);
    delete server[0]!.match;
    expect(mergeServerRows(list, server).rows[0]!.row).toEqual({ keyId: "a", missingCount: 2 });
  });

  it("savedOut이 바뀌면 row가 같아도 entry는 새로 만든다 — row 참조는 재사용한다", () => {
    const out = mergeServerRows(startListGeneration(base, 1), copy(base).filter(r => r.keyId !== "b"));
    expect(out.rows[1]!.savedOut).toBe(true);
    const back = mergeServerRows(out, copy(base));
    expect(back.rows[1]).toEqual({ row: base[1], savedOut: false });
    expect(back.rows[1]!.row).toBe(out.rows[1]!.row);
    expect(back.rows[0]).toBe(out.rows[0]);
  });

  it("이미 savedOut인 행이 계속 빠져 있으면 entry를 그대로 둔다", () => {
    const out = mergeServerRows(startListGeneration(base, 1), copy(base).filter(r => r.keyId !== "b"));
    const again = mergeServerRows(out, copy(base).filter(r => r.keyId !== "b"));
    expect(again).toBe(out);
  });
});
