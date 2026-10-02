import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { m } from "@/lib/i18n";

/**
 * Logs가 서버에서 오는 동안의 골격 (캔버스 `1i`-3).
 *
 * ⚠️ **머리는 실물이 아니라 자리표시다** — 필터는 서버 데이터(소스·행위자 목록)를 받으므로 이
 * 라우트에서는 아직 그릴 수 없다. 캔버스는 "머리는 실물, 본문만 자리표시"인데 **RSC라 머리도
 * 같은 렌더에 있다** — 의도된 이탈이고, 대신 `aria-live` 한 줄이 진행을 말한다.
 *
 * ⚠️ **골격이 `aria-hidden`이라 접근성 트리가 통째로 빈다** — `role="status"` 한 줄이 그 자리를 메운다
 * (`projects/[slug]/(home)/loading.tsx`와 같은 형).
 */
export default function LogsLoading() {
  return (
    <>
      <span className="sr-only" role="status">{m.logs.loading.list}</span>
      <PanelHeader aria-hidden>
        <div className="flex items-center gap-2">
          <SkeletonLine size="lg" className="w-16" />
          <span className="ml-auto flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
          </span>
        </div>
        {/* ⚠️ **필터 행이 실물 머리에 있다** (`log-filters.tsx`) — 없으면 목록 카드가 도착 때 48px 내려간다(#165). 컨트롤 높이는 36이다. */}
        <div data-skeleton-filter-row className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="ml-auto h-9 w-48 rounded-md" />
        </div>
      </PanelHeader>
      <PanelBody className="space-y-4" aria-hidden>
        <div className="border-border overflow-hidden rounded-lg border">
          <div className="flex min-h-12 items-center px-4 py-3">
            <SkeletonLine size="md" className="w-24" />
          </div>
          {/* 행 높이는 실물과 같다 — 다르면 데이터가 도착하는 순간 레이아웃이 튄다. 첫 행 선·chevron 칸도 실물 그대로다(4-Y3 · 4-W9). */}
          {[0, 1, 2].map((index) => (
            <div key={index} data-skeleton-event className={`${index === 0 ? "border-foreground/[0.06]" : "border-border"} flex items-center gap-3 border-t px-4 py-row-y`}>
              <div className="w-12 shrink-0"><SkeletonLine size="sm" className="w-10" /></div>
              <Skeleton className="size-7 shrink-0 rounded" />
              {/* 실물은 문장(15) + 보조 줄(배지 20) 두 줄이다 — 한 줄만 그리면 행이 55로 서고 실물은 72다(#165). */}
              <div data-skeleton-stack className="flex min-w-0 flex-1 flex-col gap-copy-gap">
                <SkeletonLine size="md" className="w-[72%]" />
                <div className="flex h-5 items-center text-xs"><Skeleton className="h-[0.8em] w-[40%] rounded-md" /></div>
              </div>
              <SkeletonLine size="xs" className="w-24" />
              <Skeleton className="size-4 shrink-0 rounded" />
            </div>
          ))}
        </div>
      </PanelBody>
    </>
  );
}
