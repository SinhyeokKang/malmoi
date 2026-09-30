"use client";

import { useEffect, useState } from "react";

/**
 * **서버가 내려 준 promise의 마지막 도착값** (ux-drift-unify U7 r1). 표시 전용 판정(Home 보류 사유 · 번역 화면 연결)이 늦게 도착하는 자리다.
 *
 * ⚠️ **`use()` + Suspense로 받지 않는다** — 재렌더마다 서버가 새 promise를 내려 주는데, 이미 보인 경계 안에서 `use(새 promise)`를 하면 그 전환
 * (키 선택 · `?event=` 상세 · 저장·Sync 뒤 재검증)이 **GitHub 조회가 끝날 때까지 커밋되지 않았다.** effect로 구독하면 전환은 바로 커밋되고,
 * 새 값이 올 때까지 옛 값이 남는다(깜빡임 없음). ⚠️ **늦게 풀린 옛 promise는 버린다** — promise가 바뀌면 옛 구독의 결과를 쓰지 않는다.
 * 거부는 삼킨다 — 호출부가 promise를 만들 때 "모름"으로 접어 둔다(Home `planHomeHold` · 번역 화면 `unknown`).
 *
 * ⚠️ **`identity`가 바뀌면 그 렌더에서 곧바로 비운다** (U7 r2) — 스위처·소스 선택은 같은 컴포넌트를 마운트한 채 다른 프로젝트로 다시 렌더할 수 있다.
 * "새 값이 올 때까지 옛 값"을 그대로 두면 그 사이 **다른 프로젝트의** 보류 사유·연결 판정이 서서 Publish·Sync를 끄거나 켠다.
 * 도착값에 그것을 받은 식별자를 붙이고, 지금 식별자와 다르면 없는 것으로 읽는다 — effect를 기다리지 않는다.
 */
export function useArrived<T>(promise: Promise<T> | undefined, identity: string): T | undefined {
  const [arrived, setArrived] = useState<{ identity: string; value: T } | null>(null);
  useEffect(() => {
    if (promise === undefined) return;
    let live = true;
    promise.then((value) => { if (live) setArrived({ identity, value }); }, () => {});
    return () => { live = false; };
  }, [promise, identity]);
  return arrived !== null && arrived.identity === identity ? arrived.value : undefined;
}
