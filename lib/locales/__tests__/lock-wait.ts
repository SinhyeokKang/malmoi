import type { Pool } from "pg";

/**
 * 다른 연결이 행 잠금을 기다리는 것이 보일 때까지 기다린다 — 5초 안에 안 보이면 실패다. 격리 PG 시나리오의 잠금 계약 테스트가 쓴다.
 * ⚠️ 고정 sleep으로 "아직 안 끝났다"를 보지 않는다 — 느린 머신에서 거짓 green·red가 난다(POSTMORTEM 2026-10-09).
 */
export async function waitForLockWait(db: Pool): Promise<void> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid()`);
    if ((rows[0]?.n ?? 0) > 0) return;
    if (Date.now() > deadline) throw new Error("no backend is waiting on a lock");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
