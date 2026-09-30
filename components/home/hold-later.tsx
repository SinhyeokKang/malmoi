"use client";

import { useArrived } from "@/components/use-arrived";
import { StatusBadge } from "@/components/ui/status-badge";
import { m } from "@/lib/i18n";
import type { HoldReason } from "@/lib/protection/plan";

/**
 * **열린 PR 조회에 달린 보류 사유** — Home의 두 자리(`To send` 카드 보조 줄 · 메타 `Last sync` 배지)가 쓰는 작은 클라이언트 섬이다(ux-drift-unify Q6 · U7 r1).
 * 본문은 이 조회를 기다리지 않는다(malmoi#107). ⚠️ **`use()`로 받지 않는다** — `useArrived` 주석(전환이 GitHub 조회를 기다렸다).
 *
 * 도착 전: 보조 줄은 `nothing to send`(이 갈래는 편집 0이라 참이다), 배지는 없음. 도착 뒤에는 다음 재렌더의 새 조회가 끝날 때까지 그 값을 든다.
 * ⚠️ 보조 줄 낱말은 `countCards`의 `holdSubline`과 같은 사전 키다(`count-cards.tsx`의 `repositoryUpdatesPaused` 갈래).
 */
export function HoldLater({ hold, as, identity }: {
  hold: Promise<HoldReason | null>;
  as: "subline" | "badge";
  /** 그 사유가 속한 프로젝트(slug) — 바뀌면 옛 프로젝트의 사유를 곧바로 버린다(`useArrived`, U7 r2). */
  identity: string;
}) {
  const reason = useArrived(hold, identity) ?? null;
  if (as === "subline") return reason === null ? m.home.cards.nothingPending : m.home.cards.held[reason];
  // 보류 배지 — 사유가 셋이어도 낱말은 `Held` 하나다(DESIGN §2.4). 사유는 카드 보조 줄이 든다.
  return reason === null ? null : <span>· <StatusBadge state="held" className="align-middle" /></span>;
}
