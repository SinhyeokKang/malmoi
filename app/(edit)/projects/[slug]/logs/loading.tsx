import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { m } from "@/lib/i18n";

/**
 * Logs가 서버에서 오는 동안의 골격 (캔버스 `1i`-3).
 *
 * ⚠️ **머리는 실물이 아니라 자리표시다** — 필터는 서버 데이터(소스·행위자 목록)를 받으므로 이
 * 라우트에서는 아직 그릴 수 없다. 캔버스는 "머리는 실물, 본문만 자리표시"인데 **RSC라 머리도
 * 같은 렌더에 있다** — 의도된 이탈이고, 대신 `aria-live` 한 줄이 진행을 말한다.
 *
 * ⚠️ **골격이 `aria-hidden`이라 접근성 트리가 통째로 빈다** — `role="status"` 한 줄이 그 자리를 메운다
 * (`projects/[slug]/loading.tsx`와 같은 형).
 */
export default function LogsLoading() {
  return (
    <>
      <span className="sr-only" role="status">{m.logs.loading.list}</span>
      <PanelHeader width="fluid" aria-hidden>
        <div className="flex items-center gap-2">
          <Block className="h-6 w-16 rounded-md" />
          <span className="ml-auto flex items-center gap-2">
            <Block className="h-9 w-50 rounded-[10px]" />
            <Block className="h-9 w-24 rounded-[10px]" />
          </span>
        </div>
      </PanelHeader>
      <PanelBody width="fluid" className="space-y-4" aria-hidden>
        <div className="border-border overflow-hidden rounded-xl border">
          <div className="p-4">
            <Block className="h-[15px] w-24 rounded-md" />
          </div>
          {/* 행 높이는 실물과 같다 — 다르면 데이터가 도착하는 순간 레이아웃이 튄다. */}
          {[0, 1, 2].map((index) => (
            <div key={index} className="border-border flex items-center gap-3 border-t px-4 py-[13px]">
              <Block className="h-3.5 w-10 shrink-0 rounded-md" />
              <Block className="size-7 shrink-0 rounded-sm" />
              <Block className="h-3.5 flex-1 rounded-md" />
              <Block className="h-3.5 w-24 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </PanelBody>
    </>
  );
}

function Block({ className }: { className: string }) {
  return <div className={`bg-foreground/5 motion-safe:animate-pulse ${className}`} />;
}
