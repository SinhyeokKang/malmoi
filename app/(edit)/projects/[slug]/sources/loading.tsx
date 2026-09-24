import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { m } from "@/lib/i18n";

/**
 * Sources가 서버에서 오는 동안의 골격 (audit-ux #5 · DESIGN §6.64 로딩 행 — 형제 화면도 같은 규칙).
 *
 * ⚠️ **`ContentPanel`을 들지 않는다** — `[slug]/layout.tsx`가 든다.
 *
 * ⚠️ **치수는 `sources-screen.tsx` 그대로다** — 머리(제목 + 배지 · 설명 · [Add source]) · `PanelCard` 헤더(`p-4`,
 * 아래 `border-divider`, 오른쪽 끝 리포 · 브랜치) · 소스 행(`px-4 py-[13px]` · 글리프 28 · 본문·경로 두 줄 · 상태 ·
 * [Open translations] · chevron). 첫 행은 헤더의 선을 쓰고 자기 선이 없다(`first:border-t-0`).
 *
 * ⚠️ **행은 하나다** — 프로젝트의 가장 흔한 모양이 소스 하나다. [Add source]는 OWNER에게만 서지만 골격은 그린다:
 * 버튼 없는 머리와 높이가 같아(제목 행이 `min-h`가 아니라 버튼 36이 정한다 — 없으면 28) 8px 차이를 받아들인다.
 */
export default function SourcesLoading() {
  return (
    <>
      <span className="sr-only" role="status">{m.sources.screenLoading}</span>
      <PanelHeader width="fluid" aria-hidden>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <SkeletonLine text="text-lg" className="w-20" />
            <Skeleton className="size-5 rounded-full" />
          </div>
          <SkeletonLine text="text-xs" className="w-72" />
          <Skeleton className="ml-auto h-9 w-32 rounded-md" />
        </div>
      </PanelHeader>

      <PanelBody width="fluid" className="space-y-4" aria-hidden>
        <div className="border-border bg-background overflow-hidden rounded-lg border">
          <div className="border-divider flex items-center gap-2 border-b p-4">
            <SkeletonLine text="text-base" className="w-16" />
            <Skeleton className="size-5 rounded-full" />
            <div className="ml-auto w-44">
              <SkeletonLine text="text-xs" className="w-full" />
            </div>
          </div>
          <div data-skeleton-source className="flex items-center gap-3 pr-4">
            <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-[13px]">
              <Skeleton className="size-7 shrink-0 rounded" />
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <SkeletonLine text="text-base" className="w-[42%]" />
                <SkeletonLine text="text-xs" className="w-[28%]" />
              </div>
              {/* 상태 — 행 높이는 왼쪽 두 줄이 정하므로 줄 자리가 아니라 블록 하나다. */}
              <Skeleton className="h-3 w-24 shrink-0 rounded-md" />
            </div>
            <Skeleton className="h-9 w-36 shrink-0 rounded-md" />
            <Skeleton className="size-4 shrink-0 rounded" />
          </div>
        </div>
      </PanelBody>
    </>
  );
}
