import { ChevronRight, History } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import type { ActivityItem } from "@/lib/home/overview";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * `Recent logs` (캔버스 `2a` 왼쪽 맨 아래).
 *
 * ⚠️ **레일이다 — 구분선이 아니다.** 점 10 + 1px 세로선이 줄을 잇고, **마지막 줄만 선이 없다**:
 * 선이 끝까지 내려오면 아래 `All logs`가 그 타임라인의 일부로 읽힌다.
 *
 * ⚠️ **파랑은 링크색이 아니라 "리포 트래픽"이다** (spec §3.3-9 — 화면에 다섯 자리). 들어온 Sync
 * 줄의 점과 그 키 수, 되돌려보낸 PR 번호가 그중 셋이고 **셋 다 링크가 아니다**: 이 카드는 요약이고
 * 목적지는 바닥의 `All logs`다.
 *
 * ⚠️ **`All logs` 링크가 잘리면 안 된다** — 잘리는 것은 그 링크부터인데, 그것이 잘리면 전체
 * 목록으로 갈 길이 화면에서 사라진다 (design §3.4). 패널이 `overflow:hidden`이라 **실측으로만**
 * 확인된다.
 */
export function LogsCard({ items, slug, now, syncedBefore }: {
  items: readonly ActivityItem[];
  slug: string;
  now: Date;
  /** 첫 Sync가 있었나 — 빈 상태의 문장이 그것으로 갈린다. */
  syncedBefore: boolean;
}) {
  return (
    /* ⚠️ **접근 이름이 있어야 `region` 랜드마크다** — 없으면 `generic`으로 접힌다 (`attention-card` 주석). */
    <section className="border-border flex flex-col overflow-hidden rounded-lg border" aria-labelledby="home-logs-title">
      <h2 id="home-logs-title" className="shrink-0 p-4 text-base font-medium">{m.home.logs.title}</h2>

      {items.length === 0 ? (
        <EmptyState
          className="border-divider border-t px-4 py-8"
          icon={History}
          title={m.home.logs.empty.title}
          description={syncedBefore ? m.home.logs.empty.description : m.home.logs.empty.beforeFirstSync}
        />
      ) : (
        <ul className="border-divider flex flex-col border-t px-4 pt-3.5">
          {items.map((item, index) => {
            const last = index === items.length - 1;
            return (
              <li key={itemKey(item)} className="flex shrink-0 gap-3">
                <span className="flex w-2.5 shrink-0 flex-col items-center">
                  {/*
                    ⚠️ **점이 채움이 아니라 테두리 2px다** — 채우면 10px 원이 글머리표로 읽히고,
                    테두리면 타임라인의 **노드**가 된다. sync 줄만 파랗다.
                  */}
                  <span
                    className={cn(
                      "mt-1.5 block size-2.5 shrink-0 rounded-full border-2",
                      item.kind === "sync_failed"
                        ? "border-destructive"
                        : item.kind === "push"
                          ? "border-blue-600"
                          : "border-neutral-300",
                    )}
                    aria-hidden
                  />
                  {/* 마지막 줄에는 선이 없다 — 있으면 아래 `All logs`가 타임라인에 붙는다. */}
                  {!last && <span className="bg-divider block w-px flex-1" aria-hidden />}
                </span>
                <span className={cn("flex min-w-0 flex-1 items-baseline gap-2.5", last ? "pb-3.5" : "pb-4")}>
                  <span className="min-w-0 flex-1 text-base">{line(item)}</span>
                  <span className="shrink-0 text-xs text-neutral-400">{relativeTime(item.at, now)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* ⚠️ **빈 상태에서도 남는다** — 7일 창이 비었다고 이력이 없는 것은 아니다. */}
      <Link
        href={routes.logs(slug)}
        className="focus-visible:ring-ring hover:bg-foreground/[0.02] border-divider flex shrink-0 items-center justify-center gap-0.5 border-t px-4 py-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        {m.home.logs.all}
        {/* 화면 **안**으로 가는 이동은 전부 chevron이다 — 파랑은 바깥으로 나가는 것에만 남는다 (캔버스). */}
        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
      </Link>
    </section>
  );
}

function line(item: ActivityItem): ReactNode {
  switch (item.kind) {
    case "edit":
      return m.home.logs.edit(item.actor, <span className="font-medium">{item.key}</span>, item.locale, <span className="text-muted-foreground">{item.surfaceSlug}</span>);
    case "push":
      return m.home.logs.sync(<span className="text-blue-600">{m.home.logs.newKeys(item.newKeys)}</span>, item.surfaceSlug);
    case "publish":
      return m.home.logs.publish(
        item.prNumber === null ? null : <span className="text-blue-600">{m.home.meta.pr(item.prNumber)}</span>,
        item.changed,
      );
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
