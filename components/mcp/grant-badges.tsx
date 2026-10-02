import { Badge } from "@/components/ui/badge";
import { m } from "@/lib/i18n";
import type { TokenGrant } from "@/lib/mcp/grant";
import { cn } from "@/lib/utils";

/**
 * `Allowed actions` 값 — 권한 하나당 배지 하나다(2026-09-30 사용자 — ` · `로 이은 글자에서 바꿨다). 정해진 넷 중 고른 것이라 배지가 맞다.
 * 없으면 `Read only` 배지 하나. 토큰 카드와 Connected apps 행이 같은 모양이어야 같은 권한이 두 카드에서 다르게 읽히지 않는다.
 * `dimmed` — 만료 행은 값이 흐리다(보관 행과 같은 `gray-dim`).
 */
export function GrantBadges({ grants, dimmed = false }: { grants: readonly TokenGrant[]; dimmed?: boolean }) {
  const labels = grants.length === 0 ? [m.mcpConnector.token.readOnly] : grants.map((grant) => m.mcpConnector.grants[grant].label);
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {labels.map((label) => (
        <Badge key={label} variant="soft-neutral" className={cn(dimmed && "text-gray-dim")}>
          {label}
        </Badge>
      ))}
    </span>
  );
}
