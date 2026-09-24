import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * 재검증 트리를 기다리는 상한 (malmoi#103). Slow 4G 실측의 커밋 지연이 0.6–1.5 s였고, 첫 적재·Sync 응답은 트리가 더 무겁다.
 * 넘기면 잠금을 푼다 — 재검증이 같은 값을 주거나(누가 먼저 같은 일을 했다) 응답이 끊겨 트리가 끝내 안 와도 버튼이 영구히
 * 잠기지 않게 하는 안전판이다. 풀린 뒤의 화면은 옛 트리일 수 있지만, 그 버튼을 누르면 서버가 판정한다.
 */
export const COMMIT_WAIT_MS = 10_000;

/**
 * **Action이 풀린 뒤 서버 트리가 커밋될 때까지** 교차 잠금을 잇는다 (malmoi#103).
 *
 * Action의 promise는 응답 머리에서 풀리고, `revalidatePath`가 실은 새 RSC 트리는 그 뒤 스트리밍으로 와 늦게 커밋된다. 그 사이
 * 수동 `pending`을 내리면 다른 트리거가 옛 수치로 켜진다. ⚠️ **async transition으로 해결하지 않는다** — 열린 async action
 * 스코프가 그 뒤의 모든 transition(내비게이션 포함)을 얽는다(ARCHITECTURE §3 · POSTMORTEM 2026-09-18).
 *
 * `signal`은 **서버가 렌더할 때마다 새 객체가 되는 prop**이다(RSC 페이로드는 매번 새로 역직렬화된다). 값이 아니라 식별자를 보는
 * 이유: 재검증이 같은 수치를 줄 수도 있다. ⚠️ **스냅샷은 Action을 부르기 전에 뜬다** — 응답 뒤에 뜨면 이미 커밋된 새 트리를
 * "옛 것"으로 잡아 상한까지 잠긴다. ⚠️ 비교 기준은 **커밋된** 값이다(`useLayoutEffect`) — 렌더 중인(아직 커밋 전) 트리를 보면
 * 기다려야 할 창을 이미 지난 것으로 읽는다.
 */
export function useCommitWait(signal: unknown): { waiting: boolean; snapshot: () => unknown; wait: (from: unknown) => void } {
  const committed = useRef(signal);
  useLayoutEffect(() => { committed.current = signal; }, [signal]);
  const [from, setFrom] = useState<{ signal: unknown } | null>(null);
  // 새 트리가 왔다 — 렌더 중에 내린다(같은 커밋에서 잠금이 풀린다).
  if (from !== null && from.signal !== signal) setFrom(null);
  useEffect(() => {
    if (from === null) return;
    const timer = setTimeout(() => setFrom(null), COMMIT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [from]);
  return {
    waiting: from !== null,
    snapshot: () => committed.current,
    // 이미 새 트리가 커밋됐으면 기다릴 것이 없다.
    wait: (start) => { if (start === committed.current) setFrom({ signal: start }); },
  };
}
