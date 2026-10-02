import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * **개수 배지** (DESIGN §6.4 · 2026-10-01 ux-drift-unify Q13) — 카드·패널 머리의 총계, 트리·세그먼트·사이드바·Publish 버튼의 로컬 개수.
 *
 * ⚠️ **0이면 서지 않는다** — `0`을 배지로 세우면 하나의 항목처럼 읽힌다(Home 주의 카드 `2a-empty`에서 처음 정한 규칙을 전부로 넓혔다 —
 * 그 전엔 "0도 보인다"가 사이드바·세그먼트의 규칙이라 같은 개수가 화면마다 서거나 사라졌다).
 * ⚠️ **숫자는 `aria-hidden`이고 `label`이 sr 문장이다** — 숫자만 낭독하면 접근 이름이 "Members 3"이 된다. 기본값을 두지 않는다
 * (RowCard의 옛 기본값 `m.projects.count`가 멤버 카드에서 "3 projects"를 낭독했다).
 * `className`은 배치만 덧댄다 — Publish 버튼 안처럼 어두운 면 위에서는 면·글자를 그 면에 맞춰 덮는다.
 */
export function CountBadge({ count, label, className }: { count: number; label: string; className?: string }) {
  if (count === 0) return null;
  return (
    <Badge variant="soft-neutral" className={cn(className)}>
      <span aria-hidden>{count.toLocaleString("en-US")}</span>
      <span className="sr-only">{label}</span>
    </Badge>
  );
}

/**
 * 카드 머리의 개수 prop — **개수와 sr 문장은 짝이다**. 문장 없는 개수는 타입 오류다(전엔 `countLabel ?? ""`로 빈 문장의 배지가 섰고,
 * 연결 앱 카드는 카드 제목을 문장으로 넘겨 스크린리더가 개수를 못 들었다).
 */
export type CountProps = { count: number; countLabel: string } | { count?: undefined; countLabel?: undefined };
