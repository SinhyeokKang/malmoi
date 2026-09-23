/**
 * 저장 직후 목록 보존 (translation-rework — spec §3.4 · §7).
 *
 * 저장은 목록의 멤버십·순서를 바꾸지 않는다. 조건을 벗어난 행은 자리에 남아 `savedOut`이 되고,
 * 보존은 필터 세대가 바뀌면(필터·검색·범위·트리·새로고침) 끝난다 — 새 세대는 `startListGeneration`으로 시작한다.
 */
export type ListGeneration<Row> = { generation: number; rows: { row: Row; savedOut: boolean }[] };

export function startListGeneration<Row>(rows: readonly Row[], generation: number): ListGeneration<Row> {
  return { generation, rows: rows.map(row => ({ row, savedOut: false })) };
}

export function applySavedRow<Row extends { keyId: string }>(
  list: ListGeneration<Row>,
  saved: { keyId: string; row: Row; matches: boolean; generation?: number },
): ListGeneration<Row> {
  if (saved.generation !== undefined && saved.generation !== list.generation) return list;
  if (!list.rows.some(entry => entry.row.keyId === saved.keyId)) return list;
  return {
    generation: list.generation,
    rows: list.rows.map(entry => entry.row.keyId === saved.keyId ? { row: saved.row, savedOut: !saved.matches } : entry),
  };
}

/** 머리의 `+{n} saved` — 표시 행 수와 현재 조건의 일치 수가 다른 만큼. */
export function savedOutCount(list: ListGeneration<unknown>): number {
  return list.rows.filter(entry => entry.savedOut).length;
}
