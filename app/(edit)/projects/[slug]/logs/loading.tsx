import { RefreshCw, Search } from "lucide-react";

import { PANEL_HEAD_ROW, PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Button } from "@/components/ui/button";
import { FieldTrigger } from "@/components/ui/field-trigger";
import { Input } from "@/components/ui/input";
import { LOG_ROW_CHEVRON_STACK, LOG_ROW_RESULT_STACK, LOG_ROW_STACK, LOG_ROW_TIME_STACK } from "@/components/logs/row-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getMessages } from "@/lib/i18n/server";

/**
 * Logs가 서버에서 오는 동안의 골격 (캔버스 `1i`-3).
 *
 * ⚠️ **머리는 실물이 아니라 자리표시다** — 필터는 서버 데이터(소스·행위자 목록)를 받으므로 이
 * 라우트에서는 아직 그릴 수 없다. 캔버스는 "머리는 실물, 본문만 자리표시"인데 **RSC라 머리도
 * 같은 렌더에 있다** — 의도된 이탈이고, 대신 `aria-live` 한 줄이 진행을 말한다.
 *
 * ⚠️ **행은 "결과 있는 사건"이 가장 흔한 모양이다**(responsive-app fix1) — 결과 칸 하나를 그린다. 좁은 그릇(`@max-form`)에서 결과가 없는 행(번역 편집 등)은
 * 실물이 결과 줄(`empty:hidden`)만큼 한 줄 짧다 — 도착 순간 그 행만 줄어드는 것을 받는다(줄 수가 사건 종류에 달려 골격이 못 따라간다).
 *
 * ⚠️ **골격이 `aria-hidden`이라 접근성 트리가 통째로 빈다** — `role="status"` 한 줄이 그 자리를 메운다
 * (`projects/[slug]/(home)/loading.tsx`와 같은 형).
 */
export default async function LogsLoading() {
  const m = await getMessages();
  return (
    <>
      <span className="sr-only" role="status">{m.logs.loading.list}</span>
      <PanelHeader aria-hidden>
        {/* 실물 제목 행과 같은 조각이다 — 머리 컨테이너 640 미만에서 실물만 두 줄이면 도착할 때 머리가 44 튄다(A-09). */}
        <div data-skeleton-header className={PANEL_HEAD_ROW}>
          <div className="relative flex">
            <h1 className="flex items-center text-lg font-medium invisible">{m.common.nav.logs}</h1>
            <Skeleton size="lg" className="absolute left-0 top-1/2 w-16 -translate-y-1/2" />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex">
              <Button disabled tabIndex={-1} className="gap-1.5 invisible">
                <RefreshCw className="size-4 shrink-0" aria-hidden />
                {m.logs.refresh}
              </Button>
              <Skeleton className="absolute inset-0 rounded-md" />
            </div>
          </div>
        </div>
        {/* 기본 라벨을 보이지 않는 실물 컨트롤로 재야 언어·폭에 따른 줄바꿈도 같다(#201).
            이 라우트는 선택 질의·소스·행위자를 모르므로 기본 필터의 자리만 예약한다. */}
        <div data-skeleton-filter-row className="flex flex-wrap items-center gap-2">
          {[m.logs.kinds.all, m.logs.filters.anyDate, m.logs.filters.anyone, m.logs.filters.anySource, m.logs.filters.anyResult].map((label, index) => (
            <div key={index} className="relative flex shrink-0">
              <FieldTrigger active={false} disabled tabIndex={-1} className="shrink-0 invisible">{label}</FieldTrigger>
              <Skeleton className="absolute inset-0 rounded-md" />
            </div>
          ))}
          <div className="relative ml-auto">
            <Input type="search" width={320} icon={<Search className="invisible" />} clearable defaultValue="" disabled tabIndex={-1} className="invisible" />
            <Skeleton className="absolute inset-0 rounded-md" />
          </div>
        </div>
      </PanelHeader>
      <PanelBody className="space-y-4" aria-hidden>
        <div className="@container border-border overflow-hidden rounded-lg border">
          <div className="flex min-h-12 items-center px-4 py-3">
            <Skeleton size="md" className="w-24" />
          </div>
          {/* 행 높이는 실물과 같다 — 다르면 데이터가 도착하는 순간 레이아웃이 튄다. 첫 행 선·chevron 칸도 실물 그대로다(4-Y3 · 4-W9). */}
          {[0, 1, 2].map((index) => (
            <div key={index} data-skeleton-event className={cn(index === 0 ? "border-foreground/[0.06]" : "border-border", "flex items-center gap-3 border-t px-4 py-row-y", LOG_ROW_STACK)}>
              <div className={cn("w-28 shrink-0", LOG_ROW_TIME_STACK)}><Skeleton size="sm" className="w-10" /></div>
              <Skeleton className="size-7 shrink-0 rounded" />
              {/* 실물은 문장(15) + 보조 줄(배지 20) 두 줄이다 — 한 줄만 그리면 행이 55로 서고 실물은 72다(#165). */}
              <div data-skeleton-stack className="flex min-w-0 flex-1 flex-col gap-copy-gap">
                <Skeleton size="md" className="w-[72%]" />
                <div className="flex h-5 items-center text-xs"><Skeleton className="h-[0.8em] w-[40%] rounded-md" /></div>
              </div>
              <div className={cn("flex w-[172px] shrink-0 flex-wrap items-center justify-end gap-1.5", LOG_ROW_RESULT_STACK)}>
                <Skeleton size="xs" className="w-24" />
              </div>
              <Skeleton className={cn("size-4 shrink-0 rounded", LOG_ROW_CHEVRON_STACK)} />
            </div>
          ))}
        </div>
      </PanelBody>
    </>
  );
}
