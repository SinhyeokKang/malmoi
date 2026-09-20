import { ChevronRight, History } from "lucide-react";
import Link from "next/link";

import { EventRow } from "@/components/logs/event-row";
import { EmptyState } from "@/components/ui/empty-state";
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
    /* ⚠️ **접근 이름이 있어야 `region` 랜드마크다** — 없으면 `generic`으로 접힌다 (`attention-card` 주석). */
    <section className="border-border flex flex-col overflow-hidden rounded-lg border" aria-labelledby="home-logs-title">
      <h2 id="home-logs-title" className="shrink-0 p-4 text-base font-medium">{m.home.logs.title}</h2>

      {rows.length === 0 ? (
        <EmptyState
          className="border-divider border-t px-4 py-8"
          icon={History}
          title={m.logs.empty.title}
          description={syncedBefore ? m.logs.empty.description : m.home.logs.empty.beforeFirstSync}
        />
      ) : (
        <ul className="border-divider flex flex-col border-t">
          {rows.map((row) => (
            <li key={row.id} id={`event-${row.ref}`} tabIndex={-1} className="border-divider not-first:border-t">
              {/* ⚠️ **시각 열이 없다** — 날짜 카드가 없으므로 오른쪽에 상대 시각이 서고 결과는 보조줄로 내려간다. */}
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
    </section>
  );
}
