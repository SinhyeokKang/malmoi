import { Badge } from "@/components/ui/badge";

/**
 * 역할 배지 — 이전이 없으면(초대·합류) 새 역할 하나, 바뀌었으면 `이전 → 이후`다(2026-09-30 사용자 — `— → OWNER`가 어색했다).
 * Logs 행 보조줄과 상세의 Role 칸이 같은 모양을 쓴다. 이후가 없으면(제거) 이전 하나에 줄을 긋지 않고 그대로 둔다.
 */
export function RoleBadges({ before, after }: { before: string | null; after: string | null }) {
  if (before === null || after === null) {
    const only = after ?? before;
    return only === null ? null : <Badge variant="soft-neutral">{only}</Badge>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="soft-neutral">{before}</Badge>
      <span aria-hidden>→</span>
      <span className="sr-only">to</span>
      <Badge variant="soft-neutral">{after}</Badge>
    </span>
  );
}
