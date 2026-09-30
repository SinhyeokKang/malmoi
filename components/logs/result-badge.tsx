import { Badge } from "@/components/ui/badge";
import type { EventTone } from "@/lib/events/view";

/**
 * 사건 결과 라벨 — **셋 다 배지다** (2026-09-30 사용자 — 무색 평문 · 붉은 글자 · 호박 배지가 섞여 있던 것을 한 모양으로).
 * 톤은 호출부가 `logsResultTone`으로 받는다 — Logs의 성공은 회색이다(D3③ · §2.4 예외 2). 할 일이 없던 실행·진행 중·성공은 `neutral`,
 * 보류·부분은 `warning`, 실패는 붉은 채움 알약(§2.4 — danger 배지는 `missing` 하나다).
 * 행과 상세 머리가 같은 컴포넌트를 쓴다 — 한쪽만 바뀌면 같은 결과가 두 모양이 된다.
 */
const VARIANT = { success: "success", muted: "neutral", warning: "warning", danger: "missing" } as const satisfies Record<EventTone, string>;

export function ResultBadge({ tone, label }: { tone: EventTone; label: string }) {
  return <Badge variant={VARIANT[tone]}>{label}</Badge>;
}
