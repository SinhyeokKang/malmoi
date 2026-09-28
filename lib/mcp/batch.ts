/**
 * `set_translations`의 입력 판정 (mcp-connector design §2.2). 키별 거부(`not-found`·`cannot-clear` 등)는 tx 안의 일이고 정상 결과다 —
 * 여기서 막는 것은 **호출 전체가 틀린** 둘(상한·중복)뿐이다.
 */

/** 한 잠금·한 tx에 드는 키 수. 잠금 tx 실측이 키당 0.5–0.7초라 키별 tx로는 60초 안에 못 든다 — 그래서 한 tx이고 상한이 있다. */
export const BATCH_SAVE_LIMIT = 100;

export type BatchSavePlan<T> =
  | { status: "ok"; entries: readonly T[] }
  | { status: "empty" }
  | { status: "too-many"; limit: number }
  /** 같은 키가 두 번이면 어느 값이 이겼는지를 판정해야 한다 — 그 판정을 만들지 않는다. */
  | { status: "duplicate-key"; keyId: string };

export function planBatchSave<T extends { keyId: string }>(entries: readonly T[]): BatchSavePlan<T> {
  if (entries.length === 0) return { status: "empty" };
  if (entries.length > BATCH_SAVE_LIMIT) return { status: "too-many", limit: BATCH_SAVE_LIMIT };
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.keyId)) return { status: "duplicate-key", keyId: entry.keyId };
    seen.add(entry.keyId);
  }
  return { status: "ok", entries };
}
