import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { m } from "@/lib/i18n";
import { PANEL } from "@/lib/translations/layout";

/**
 * 번역 작업 화면이 서버에서 오는 동안의 골격 (audit-ux #5 · DESIGN §6.64 로딩 행 — 형제 화면도 같은 규칙).
 *
 * ⚠️ **`ContentPanel`도 `PanelHeader`·`PanelBody`도 들지 않는다** — 패널은 `[slug]/layout.tsx`가 들고, 작업 화면은
 * 폭 등급 없이 세 패널이 본문 전체를 든다(`workspace.tsx`). 프리미티브를 쓰면 `max-w`가 걸려 실물보다 좁아진다.
 *
 * ⚠️ **세 패널이 첫 렌더의 폭 그대로다** — 왼쪽 카드 `PANEL.tree + PANEL.list`(트리 260 + 목록 392) · 핸들 16 · 오른쪽
 * 나머지. 실물도 `ResizeObserver`가 재기 전 첫 렌더는 이 값이라, 저장된 폭이 없는 사람에게는 도착 때 안 움직인다.
 *
 * ⚠️ **상세는 키를 안 고른 모양이다** — 사이드바·Sources에서 오는 가장 흔한 진입이 `?key=` 없이다. 트리는 표면 하나 +
 * 이름공간 넷(All + 셋), 키 목록은 화면을 채우는 수라 넘치는 줄은 잘린다(목록이 자기 안에서 스크롤한다).
 */
export default function TranslationsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <span className="sr-only" role="status">{m.translations.loading}</span>
      <div className="border-border flex shrink-0 flex-col gap-3 border-b p-4" aria-hidden>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2">
            <SkeletonLine text="text-lg" className="w-28" />
            <Skeleton className="size-5 rounded-full" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-md" />
          ))}
          <Skeleton className="ml-auto h-9 w-80 rounded-md" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-4" aria-hidden>
        <div className="flex h-full min-h-0">
          <div
            className="border-border bg-background flex min-h-0 shrink-0 overflow-hidden rounded-lg border"
            style={{ width: PANEL.tree + PANEL.list }}
          >
            <div data-skeleton-tree className="border-border flex min-h-0 shrink-0 flex-col border-r" style={{ width: PANEL.tree }}>
              <PanelHead title="w-16" />
              <div className="border-divider flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden border-t p-2">
                <div className="flex items-center gap-2 px-2 py-[7px]">
                  <Skeleton className="size-3.5 shrink-0 rounded" />
                  <Skeleton className="size-4 shrink-0 rounded" />
                  <SkeletonLine text="text-sm" className="w-[60%]" />
                </div>
                {["w-[70%]", "w-[45%]", "w-[55%]", "w-[40%]"].map((width) => (
                  <div key={width} className="flex items-center gap-2 py-1.5 pr-2 pl-[30px]">
                    <Skeleton className="size-3.5 shrink-0 rounded" />
                    <SkeletonLine text="text-sm" className={width} />
                  </div>
                ))}
              </div>
            </div>
            <div data-skeleton-keys className="flex min-h-0 min-w-0 flex-1 flex-col">
              <PanelHead title="w-12" aside />
              <div className="min-h-0 flex-1 overflow-hidden">
                {Array.from({ length: 10 }, (_, i) => (
                  <div
                    key={i}
                    data-skeleton-key
                    className={`flex items-start gap-3 border-t px-4 py-3 ${i === 0 ? "border-divider" : "border-border"}`}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <SkeletonLine text="text-sm" className={i % 2 === 0 ? "w-[72%]" : "w-[55%]"} />
                      <SkeletonLine text="text-xs" className={i % 2 === 0 ? "w-[40%]" : "w-[50%]"} />
                    </div>
                    <Skeleton className="mt-1 h-3 w-14 shrink-0 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* 리사이즈 핸들 자리 — 투명 16이고 선이 없다. */}
          <div className="w-4 shrink-0" />
          <div data-skeleton-detail className="border-border bg-background flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border">
            {/* `EmptyState` 치수 — `py-12` · 칩 48(`mb-3`) · 제목 18(`mb-1`) · 설명 14. */}
            <div className="flex flex-1 items-center justify-center">
              <div className="flex w-full flex-col items-center py-12">
                <Skeleton className="mb-3 size-12 rounded-full" />
                <div className="mb-1 flex w-full justify-center">
                  <SkeletonLine text="text-lg" className="w-56" />
                </div>
                <div className="flex w-full justify-center">
                  <SkeletonLine text="text-sm" className="w-72" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 트리·목록의 53 머리 — 제목 + 개수 배지(+ 목록은 오른쪽 끝 정렬 안내). 아래 선은 본문 쪽이 든다. */
function PanelHead({ title, aside = false }: { title: string; aside?: boolean }) {
  return (
    <div className="flex h-[53px] shrink-0 items-center gap-2 px-4">
      <SkeletonLine text="text-base" className={title} />
      <Skeleton className="size-5 rounded-full" />
      {aside && <Skeleton className="ml-auto h-3 w-24 rounded-md" />}
    </div>
  );
}
