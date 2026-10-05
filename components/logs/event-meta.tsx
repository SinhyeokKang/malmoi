import { Fragment } from "react";

import { RoleBadges } from "@/components/logs/role-badges";
import { LocaleFlag } from "@/components/translations/locale-badge";
import { Badge } from "@/components/ui/badge";
import { eventMeta, isBadgePart, type EventMetaRow } from "@/lib/events/view";
import type { Messages } from "@/lib/i18n";

/**
 * 사건 보조줄 — **`[배지…]  사실 · 사실`** 한 문법이다(2026-09-30 사용자 — `eventMeta` 주석). Home 최근 로그와 Logs가
 * 이 컴포넌트 하나를 쓴다 — 두 화면의 보조줄은 글자 하나까지 같다(결과 배지는 보조줄 밖, 행 오른쪽이다).
 */
export function EventMetaLine({ row, archived, m }: { row: EventMetaRow; archived: boolean;
  m: Messages;
}) {
  const parts = eventMeta(m, row, archived);
  const badges = parts.filter(isBadgePart);
  const facts = parts.filter((part) => !isBadgePart(part));
  if (parts.length === 0) return null;
  return (
    <span data-event-meta className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs wrap-anywhere">
      {badges.map((part, index) => {
        if (typeof part === "string") return null;
        if (part.kind === "roles") return <RoleBadges key={index} before={part.before} after={part.after} />;
        if (part.kind === "locale") return <Badge key={index} variant="soft-neutral" className="gap-1"><LocaleFlag code={part.code} />{part.code}</Badge>;
        return <Badge key={index} variant="soft-neutral">{part.text}</Badge>;
      })}
      {facts.length > 0 && (
        <span>
          {facts.map((part, index) => (
            <Fragment key={index}>
              {index > 0 && " · "}
              {typeof part === "string" ? part : part.kind === "link" ? <span className="text-link">{part.text}</span> : null}
            </Fragment>
          ))}
        </span>
      )}
    </span>
  );
}
