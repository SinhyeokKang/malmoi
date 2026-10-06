import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { getMessages } from "@/lib/i18n/server";

/**
 * Sources가 서버에서 오는 동안의 골격 (audit-ux #5 · DESIGN §6.64 로딩 행 — 형제 화면도 같은 규칙).
 *
 * ⚠️ **`ContentPanel`을 들지 않는다** — `[slug]/layout.tsx`가 든다.
 *
 * ⚠️ **치수는 `sources-screen.tsx` 그대로다** — 머리(제목 · [Add source]) · `Card` 헤더(`px-4 py-3`,
 * 아래 `border-divider`, 제목 + 개수 배지, 오른쪽 끝 리포 · 브랜치) · 소스 행(`px-4 py-row-y` · 글리프 28 · 본문·경로 두 줄 · 상태 ·
 * chevron). 첫 행은 헤더의 선을 쓰고 자기 선이 없다(`first:border-t-0`). 실물에 없는 요소(머리 설명 · 머리 개수 · 행 버튼)를
 * 그리지 않는다 — 도착 순간 폭이 튄다(4-Y16 · 4-Y6).
 * ⚠️ **개수 원은 카드 머리 하나만 그린다**(4-W13) — 실물 `CountBadge`는 0이면 서지 않지만, 골격은 아래 "행은 하나다"와 같은
 * 가정(소스 하나)을 그리고 그때 실물 배지는 선다. 머리의 원은 실물에 총계가 없어 지웠다.
 *
 * ⚠️ **좁은 폭 분기가 없다, 실물과 같이** (2026-10-06) — 실물이 패널 1016 이하에서 상태를 셋째 줄로 내리던 분기를 걷었다.
 *   골격이 옛 분기를 남기면 1280(패널 1014)에서 도착 순간 행이 한 줄만큼 줄어든다(malmoi#101의 역방향) — `sibling-loading.test.tsx`가 센다.
 *
 * ⚠️ **행은 하나다** — 프로젝트의 가장 흔한 모양이 소스 하나다. [Add source]는 OWNER에게만 서지만 골격은 그린다:
 * 버튼 없는 머리와 높이가 같아(제목 행이 `min-h`가 아니라 버튼 36이 정한다 — 없으면 28) 8px 차이를 받아들인다.
 */
export default async function SourcesLoading() {
  const m = await getMessages();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <span className="sr-only" role="status">{m.sources.screenLoading}</span>
      <PanelHeader aria-hidden>
        <div data-skeleton-header className="flex items-center gap-3">
          {/* 제목 폭이 실물 `Sources`(68)와 같게. */}
          <Skeleton size="lg" className="w-[68px]" />
          <Skeleton className="ml-auto h-9 w-32 rounded-md" />
        </div>
      </PanelHeader>

      <PanelBody className="space-y-4" aria-hidden>
        <div className="border-border bg-background overflow-hidden rounded-lg border">
          <div className="border-divider flex min-h-12 items-center gap-2 border-b px-4 py-3">
            <Skeleton size="md" className="w-16" />
            <Skeleton className="size-5 rounded-full" />
            <div className="ml-auto w-44">
              <Skeleton size="xs" className="w-full" />
            </div>
          </div>
          <div data-skeleton-source className="flex items-center gap-3 pr-4">
            <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-row-y">
              <Skeleton className="size-7 shrink-0 rounded" />
              <div className="flex min-w-0 flex-1 flex-col gap-copy-gap">
                <Skeleton size="md" className="w-[42%]" />
                <Skeleton size="xs" className="w-[28%]" />
              </div>
              {/* 상태 — 행 높이는 왼쪽 두 줄이 정하므로 줄 자리가 아니라 블록 하나다. */}
              <Skeleton className="h-3 w-24 shrink-0 rounded-md" />
            </div>
            <Skeleton className="size-4 shrink-0 rounded" />
          </div>
        </div>
      </PanelBody>
    </div>
  );
}
