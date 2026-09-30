import { Badge } from "@/components/ui/badge";
import type { EventTone } from "@/lib/events/view";

/**
 * 사건 결과 라벨 — **셋 다 배지다** (2026-09-30 사용자 — 무색 평문 · 붉은 글자 · 호박 배지가 섞여 있던 것을 한 모양으로).
 * 무색은 `neutral`, 보류·부분은 `warning`, 실패는 붉은 채움 알약(Sources 실패와 같은 `missing` 면 — `danger` variant는 배경 없는 글자라 배지로 안 읽힌다).
 * 행과 상세 머리가 같은 컴포넌트를 쓴다 — 한쪽만 바뀌면 같은 결과가 두 모양이 된다.
 */
const VARIANT = { muted: "neutral", warning: "warning", danger: "missing" } as const satisfies Record<EventTone, string>;

export function ResultBadge({ tone, label }: { tone: EventTone; label: string }) {
  return <Badge variant={VARIANT[tone]}>{label}</Badge>;
}
