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

/**
 * 같은 세대의 **재검증**(저장 뒤 `revalidatePath`)을 받는다 — 서버 목록에 남은 행은 새 요약으로 바꾸고, 빠진 행은 자리에 남아
 * `savedOut`이 된다. 세대 시작 때 없던 행을 끼워 넣지 않는다 — 목록 멤버십·순서는 재필터(새 세대)에서만 바뀐다.
 * ⚠️ **서버 목록은 조건의 전량이다** (translation-filter-scope) — 부재가 곧 조건 이탈이다. 전엔 More로 붙인 페이지 밖 행 때문에 선택 키만
 * 판정했고(`membership`), 그래서 저장으로 조건을 벗어난 비선택 행이 `savedOut` 없이 남았다.
 */
export function mergeServerRows<Row extends { keyId: string }>(list: ListGeneration<Row>, server: readonly Row[]): ListGeneration<Row> {
  const fresh = new Map(server.map(row => [row.keyId, row]));
  let changed = false;
  /*
    ⚠️ **값이 같으면 이전 참조를 그대로 둔다** (#157) — 키 클릭(`?key=`)과 저장 뒤 재검증마다 서버가 전량 목록을 새 객체로 다시 보낸다.
    전부 새 객체로 바꾸면 `KeyRow`의 memo가 한 행도 막지 못해 5,000행이 매번 다시 렌더됐다(QA3 실측 — 클릭당 행 렌더 3,626회).
    바뀐 행이 없으면 목록 객체 자체를 돌려줘 그 위의 `useMemo`도 다시 돌지 않는다.
  */
  const rows = list.rows.map(entry => {
    const next = fresh.get(entry.row.keyId);
    if (next === undefined) {
      if (entry.savedOut) return entry;
      changed = true;
      return { row: entry.row, savedOut: true };
    }
    const row = sameValue(entry.row, next) ? entry.row : next;
    if (row === entry.row && !entry.savedOut) return entry;
    changed = true;
    return { row, savedOut: false };
  });
  return changed ? { generation: list.generation, rows } : list;
}

/** 서버가 내려 준 행(JSON 값 — 원시값·평범한 객체·배열)의 구조적 동치. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(key => Object.hasOwn(b, key) && sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
