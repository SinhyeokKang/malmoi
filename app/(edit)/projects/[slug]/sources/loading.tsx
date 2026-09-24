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
 * ⚠️ **패널 폭 질의도 실물 그대로다** (malmoi#101) — 실물은 콘텐츠 패널 1016 이하에서 머리 설명을 버리고 행 상태를
 * 셋째 줄로 내린다(`@max-[1016px]/panel:*`). 셸 최소 폭 1280에서 패널이 1014라 **가장 흔한 폭이 좁은 쪽**이다. 그래서
 * 골격도 `@container/panel` 뿌리를 스스로 세우고 같은 변형을 든다 — `sibling-loading.test.tsx`가 변형 철자를 센다.
 *
 * ⚠️ **행은 하나다** — 프로젝트의 가장 흔한 모양이 소스 하나다. [Add source]는 OWNER에게만 서지만 골격은 그린다:
 * 버튼 없는 머리와 높이가 같아(제목 행이 `min-h`가 아니라 버튼 36이 정한다 — 없으면 28) 8px 차이를 받아들인다.
 */
export default function SourcesLoading() {
  return (
    // 실물 뿌리(`data-sources-screen`)와 같은 컨테이너 — 이름 있는 질의가 걸릴 곳이 여기다.
    <div className="@container/panel flex min-h-0 flex-1 flex-col">
      <span className="sr-only" role="status">{m.sources.screenLoading}</span>
      <PanelHeader width="fluid" aria-hidden>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {/* 제목 + 배지 폭이 실물(`Sources` + 한 자리 배지 = 96)과 같게 — 68 + gap 8 + 20. */}
            <SkeletonLine text="text-lg" className="w-[68px]" />
            <Skeleton className="size-5 rounded-full" />
          </div>
          {/* 실물 설명 문구의 13px 폭(334) — 1016 이하에서는 실물처럼 사라진다. */}
          <div data-skeleton-description className="min-w-0 @max-[1016px]/panel:hidden">
            <SkeletonLine text="text-xs" className="w-[334px] max-w-full" />
          </div>
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
          <div data-skeleton-source className="flex items-center gap-3 pr-4 @max-[1016px]/panel:items-start">
            <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-[13px] @max-[1016px]/panel:items-start">
              <Skeleton className="size-7 shrink-0 rounded" />
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <SkeletonLine text="text-base" className="w-[42%]" />
                <SkeletonLine text="text-xs" className="w-[28%]" />
                {/* 좁은 폭의 상태 — 셋째 줄(`pt-0.5` + 13px 한 줄). 넓은 폭에서는 오른쪽 블록이 대신한다. */}
                <div className="hidden items-center pt-0.5 text-xs @max-[1016px]/panel:flex">
                  {"\u200b"}
                  <Skeleton className="h-[0.8em] w-24 rounded-md" />
                </div>
              </div>
              {/* 넓은 폭의 상태 — 행 높이는 왼쪽 두 줄이 정하므로 줄 자리가 아니라 블록 하나다. */}
              <Skeleton className="h-3 w-24 shrink-0 rounded-md @max-[1016px]/panel:hidden" />
            </div>
            <Skeleton className="h-9 w-36 shrink-0 rounded-md" />
            <Skeleton className="size-4 shrink-0 rounded @max-[1016px]/panel:mt-2" />
          </div>
        </div>
      </PanelBody>
    </div>
  );
}
