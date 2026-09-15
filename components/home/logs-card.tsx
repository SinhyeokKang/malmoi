import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import type { ActivityItem } from "@/lib/home/overview";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { History } from "lucide-react";

/**
 * `Recent logs` (캔버스 `2a` 왼쪽 맨 아래).
 *
 * ⚠️ **점 색이 갈래를 말하는 유일한 수단이 아니다** — 문장이 이미 무슨 일인지 말한다. 실패만
 * `#dc2626`이고 나머지는 muted다 (spec §9.5-2).
 *
 * ⚠️ **`All logs` 링크가 바닥에 있고 잘리면 안 된다** — 잘리는 것은 그 링크부터인데, 그것이
 * 잘리면 전체 목록으로 갈 길이 화면에서 사라진다 (design §3.4). 패널이 `overflow:hidden`이라
 * 이것은 **실측으로만** 확인된다 (`/design-sync` 4단계).
 */
export function LogsCard({ items, slug, now, syncedBefore }: {
  items: readonly ActivityItem[];
  slug: string;
  now: Date;
  /** 첫 Sync가 있었나 — 빈 상태의 문장이 그것으로 갈린다. */
  syncedBefore: boolean;
}) {
  return (
    <section className="border-border rounded-xl border">
      <h2 className="border-border border-b p-3.5 text-sm font-medium">{m.home.logs.title}</h2>

      {items.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={History}
          title={m.home.logs.empty.title}
          description={syncedBefore ? m.home.logs.empty.description : m.home.logs.empty.beforeFirstSync}
        />
      ) : (
        <ul className="divide-border divide-y">
          {items.map((item) => (
            <li key={itemKey(item)} className="flex items-baseline gap-2 p-3.5">
              <span
                className={cn(
                  "size-1.5 shrink-0 translate-y-[-1px] rounded-full",
                  item.kind === "sync_failed" ? "bg-destructive" : "bg-muted-foreground/40",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-xs">{line(item)}</span>
              <span className="text-muted-foreground shrink-0 text-xs">{relativeTime(item.at, now)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ⚠️ **빈 상태에서도 남는다** — 7일 창이 비었다고 이력이 없는 것은 아니다. */}
      <div className="border-border border-t p-3.5 text-center">
        <Link
          href={routes.logs(slug)}
          className="focus-visible:ring-ring text-muted-foreground text-xs focus-visible:ring-2 focus-visible:outline-none"
        >
          {m.home.logs.all}
        </Link>
      </div>
    </section>
  );
}

function line(item: ActivityItem): string {
  switch (item.kind) {
    case "edit":
      return m.home.logs.edit(item.actor, item.key, item.locale, item.surfaceSlug);
    case "push":
      return m.home.logs.sync(item.newKeys, item.surfaceSlug);
    case "publish":
      return m.home.logs.publish(item.prNumber, item.changed);
    case "sync_failed":
      return m.home.logs.syncFailed(item.surfaceSlug);
  }
}

/**
 * ⚠️ **`at`만으로는 키가 겹친다** — 같은 시각의 편집 둘이 있을 수 있고(시각 해상도가 밀리초),
 * 표면 사건은 표면마다 하나씩이라 표면도 함께 든다.
 */
function itemKey(item: ActivityItem): string {
  const at = item.at.toISOString();
  if (item.kind === "edit") return `edit:${at}:${item.surfaceSlug}:${item.key}:${item.locale}`;
  if (item.kind === "publish") return `publish:${at}`;
  return `${item.kind}:${at}:${item.surfaceSlug}`;
}
