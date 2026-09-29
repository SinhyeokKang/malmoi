import type { ProbeResult } from "./health";

/**
 * **Home의 연결 확인을 짧게 기억한다** (malmoi#107 ①). Home은 `probeRepo`(GitHub 2홉)의 결과로 카드·할 일·배너·머리의
 * `paused`를 정하므로(DESIGN §6.64) Suspense로 뒤로 뺄 수 없고, 사건 상세를 열 때마다 probe가 다시 돌았다
 * (QA 2026-09-25: Home 1.4–1.9 s vs Logs 0.6–0.8 s).
 *
 * ⚠️ **대가: App이 제거된 뒤 TTL 동안 Home이 옛 `ok`를 말할 수 있다** — 그동안 Publish가 켜져도 누르면 서버가 GitHub에서
 * 실패로 판정한다. 그래서 TTL이 짧고, **설정 화면·MCP·재연결 Action은 이 메모를 거치지 않는다**(고치러 가는 자리는 언제나 실물을 본다).
 *
 * ⚠️ **`error`는 기억하지 않는다** — 일시 장애를 TTL 동안 "확인할 수 없음"으로 붙잡는다. `not-installed`는 영구 상태라 기억한다.
 * ⚠️ **인스턴스마다 갈린다** — 모듈 수명의 `Map`이라 인스턴스 둘이 서로 다른 값을 줄 수 있고, TTL이 그 차이의 상한이다.
 */
export const PROBE_MEMO_TTL_MS = 30_000;
/** 인스턴스 하나가 드는 프로젝트 수의 상한 — 넘으면 가장 오래 넣은 것부터 버린다. */
export const PROBE_MEMO_MAX = 500;

/**
 * ⚠️ **저장된 `installationId`·`repositoryId`가 키에 든다** — 없으면 Reconnect로 저장값이 바뀐 직후 옛 probe를 새 저장값과
 * 견줘 `installation-changed`를 거짓으로 보인다. JSON 배열이라 `/`가 든 이름끼리 겹치지 않는다.
 */
export function probeMemoKey(project: { repoOwner: string; repoName: string; installationId: string | null; repositoryId: string | null }): string {
  return JSON.stringify([project.repoOwner, project.repoName, project.installationId, project.repositoryId]);
}

export function createProbeMemo({ ttlMs, max }: { ttlMs: number; max: number }) {
  const entries = new Map<string, { at: number; value: ProbeResult }>();
  return async function memo(key: string, load: () => Promise<ProbeResult>, now: number = Date.now()): Promise<ProbeResult> {
    const hit = entries.get(key);
    if (hit !== undefined && now - hit.at < ttlMs) return hit.value;
    const value = await load();
    // 다시 넣어 삽입 순서를 갱신한다 — 버리는 쪽이 "가장 오래 전에 확인한 것"이 된다.
    entries.delete(key);
    if (value.status !== "error") {
      entries.set(key, { at: now, value });
      for (const oldest of entries.keys()) {
        if (entries.size <= max) break;
        entries.delete(oldest);
      }
    }
    return value;
  };
}
