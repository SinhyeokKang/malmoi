"use client";

import { Badge } from "@/components/ui/badge";
import { useMessages } from "@/components/i18n/messages-provider";
import { STATE, stateLabel, type StateKey } from "@/lib/status/canon";

/**
 * **상태 배지 — 상태 키만 받는다** (DESIGN §2.4 · 2026-10-01 ux-drift-unify). variant와 낱말은 `STATE`(`lib/status/canon.ts`)가 든다.
 *
 * ⚠️ **variant·낱말 prop이 없다** — 호출부가 고르는 자리가 남으면 같은 상태가 화면마다 다른 알약이 된다(보관 세 모양 · Unsent 손 조립
 * 알약 · Not synced yet 글자색). 표에 없는 상태가 필요하면 표에 행을 더한다. `className`은 배치(`shrink-0`·여백)만 덧댄다.
 */
export function StatusBadge({ state, className }: { state: StateKey; className?: string }) {
  const m = useMessages();
  const row = STATE[state];
  return <Badge variant={row.variant} className={className}>{stateLabel(m, state)}</Badge>;
}
