import { ChevronRight, History } from "lucide-react";
import Link from "next/link";

import { EventRow } from "@/components/logs/event-row";
import { PanelCard } from "@/components/ui/panel-card";
import { EmptyRowCard } from "@/components/ui/row-card";
import type { EventRow as Row } from "@/lib/events/query";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * `Recent logs` — **Logs와 같은 스트림의 최신 여섯** (logs-rework 캔버스 `1h`).
 *
 * ⚠️ **타임라인 점이 종류 글리프로 바뀌었다.** 점은 아무 값도 싣지 않았고 "새 것"을 뜻하던 파랑은
 * 새로고침하면 뜻이 바뀐다 — 같은 사건이 Home과 Logs에서 **같은 모양**이어야 한다.
 *
 * ⚠️ **7일 창이 사라졌다.** 그 창은 조용한 프로젝트의 카드를 통째로 비웠다(열흘 전에 마지막
 * Publish가 있었는데도). 지금은 기간 조건 없이 최신 여섯이고, 여섯이 없으면 그만큼만 그린다 —
 * 상대 시각이 오른쪽에 남는 이유도 그것이다(`3h ago`와 `12d ago`가 같은 목록에 설 수 있다).
 *
 * ⚠️ **상세가 Home 위에서 열린다** — 행이 `routes.project(slug, { event })`를 가리키고 닫으면
 * Home으로 돌아온다. Logs로 튕겨 보내지 않는다. `[All logs]`만 목록으로 간다.
 */
export function LogsCard({ rows, slug, now, archived, syncedBefore }: {
  rows: readonly Row[];
  slug: string;
  now: Date;
  archived: boolean;
  /** 첫 Sync가 있었나 — 빈 상태의 문장이 그것으로 갈린다. */
  syncedBefore: boolean;
}) {
  return (
    /* 머리·머리 아래 선·접근 이름(`region`)은 `PanelCard`가 든다(5-Y12 — 손으로 복제한 머리가 셋이었다). */
    <PanelCard title={m.home.logs.title}>
      {rows.length === 0 ? (
        /* 카드 안 0건은 `EmptyRowCard inset` 하나다(4-Y14). ⚠️ `-mt-px` — inset의 위 선과 머리 선을 한 줄로 겹친다(`attention-card`와 같다). */
        <div className="-mt-px">
          <EmptyRowCard
            inset
            icon={History}
            title={m.logs.empty.title}
            description={syncedBefore ? m.logs.empty.description : m.home.logs.empty.beforeFirstSync}
          />
        </div>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            /* 선은 `RowCard` 규칙이다(4-Y4) — 머리↔첫 행은 머리 선, 행↔행은 `--border`. Logs 화면의 같은 행과 같은 색이다. */
            <li key={row.id} id={`event-${row.ref}`} tabIndex={-1} className="border-border not-first:border-t">
              {/* ⚠️ **시각 열이 없다** — 날짜 카드가 없으므로 오른쪽에 상대 시각이 서고, 결과 배지는 행 오른쪽 그 앞이다(D3⑤ · `event-row`). */}
              <EventRow row={row} href={routes.project(slug, { event: row.ref })} now={now} archived={archived} showTime={false} />
            </li>
          ))}
        </ul>
      )}

      {/* ⚠️ **빈 상태에서도 남는다** — 카드가 비었다고 이력이 없는 것은 아니다. 필터 없는 첫 페이지로 간다. */}
      <Link
        href={routes.logs(slug)}
        className="focus-visible:ring-ring hover:bg-foreground/[0.02] border-divider flex shrink-0 items-center justify-center gap-0.5 border-t px-4 py-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        {m.home.logs.all}
        {/* 화면 **안**으로 가는 이동은 전부 chevron이다 — 파랑은 바깥으로 나가는 것에만 남는다 (캔버스). */}
        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
      </Link>
    </PanelCard>
  );
}
