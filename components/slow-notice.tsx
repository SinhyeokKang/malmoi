"use client";

import { useEffect, useState } from "react";

import { GITHUB_WAIT_MS } from "@/lib/github-wait";
import { m } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * 긴 원격 실행(리포 탐지·첫 적재·Sync·Publish)이 이 시간을 넘기면 지연 문구 한 줄을 세운다 (audit-ux #23 — DESIGN §6.4 "긴 실행의 지연 문구").
 *
 * ⚠️ **값이 하나다** — 화면마다 다르면 같은 대기가 한 화면에선 "오래 걸린다", 다른 화면에선 아무 말이 없다.
 * 값은 화면이 GitHub을 기다리는 마감(`GITHUB_WAIT_MS`, 8초)을 그대로 쓴다: 작은 리포의 탐지·Publish는 그 안에 끝나고,
 * 그 선을 넘긴 실행은 GitHub 호출을 여러 번 도는 큰 리포다. 사본을 두지 않는다 — 마감이 움직이면 "오래 걸린다"의 선도 같이 움직여야 한다.
 */
export const SLOW_AFTER_MS = GITHUB_WAIT_MS;

/** `active`가 켜진 뒤 `SLOW_AFTER_MS`가 지났는가. 꺼지면 되돌아가고, 다시 켜지면 처음부터 잰다. */
export function useSlow(active: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active]);
  return active && slow;
}

/**
 * ⚠️ **진행 단계를 주장하지 않는다** — 진행 이벤트를 내는 API가 없다. 말하는 것은 "아직 도는 중이고 큰 리포는 원래 오래 걸린다"뿐이다.
 * `role="status"`로 선다. ⚠️ **낭독을 보장하지 않는다** — 내용과 함께 삽입된 live 영역은 스크린리더(특히 VoiceOver)가 건너뛸 수
 * 있다. 진행 신호의 정본은 트리거의 `aria-busy`이고 이 줄은 보조다.
 */
export function SlowNotice({ active, className }: { active: boolean; className?: string }) {
  if (!useSlow(active)) return null;
  return <p role="status" className={cn("text-muted-foreground text-xs", className)}>{m.common.slow}</p>;
}
