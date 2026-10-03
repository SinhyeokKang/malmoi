"use client";

import { useArrived } from "@/components/use-arrived";
import { m } from "@/lib/i18n";
import type { HoldReason } from "@/lib/protection/plan";

/**
 * **열린 PR 조회에 달린 보류 사유** — Home `To send` 카드 보조 줄의 작은 클라이언트 섬이다(ux-drift-unify Q6 · U7 r1). 메타 열의 Hold는
 * 탭 껍데기(`meta-tabs.tsx`)가 같은 promise의 결론(`homeLate`)을 따로 받는다 — 패널이 탭 전환마다 다시 마운트되어 이 섬을 쓸 수 없다.
 * 본문은 이 조회를 기다리지 않는다(malmoi#107). ⚠️ **`use()`로 받지 않는다** — `useArrived` 주석(전환이 GitHub 조회를 기다렸다).
 *
 * 도착 전: 보조 줄은 `nothing to send`(이 갈래는 편집 0이라 참이다). 도착 뒤에는 다음 재렌더의 새 조회가 끝날 때까지 그 값을 든다.
 * ⚠️ 보조 줄 낱말은 `countCards`의 `holdSubline`과 같은 사전 키다(`count-cards.tsx`의 `repositoryUpdatesPaused` 갈래).
 */
export function HoldLater({ hold, identity }: {
  hold: Promise<HoldReason | null>;
  /** 그 사유가 속한 프로젝트(slug) — 바뀌면 옛 프로젝트의 사유를 곧바로 버린다(`useArrived`, U7 r2). */
  identity: string;
}) {
  const reason = useArrived(hold, identity) ?? null;
  return reason === null ? m.home.cards.nothingPending : m.home.cards.held[reason];
}
