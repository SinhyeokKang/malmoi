import { PANEL_HEAD_ROW, PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { SOURCE_CONTENT_STACK, SOURCE_STATUS_STACK } from "@/components/sources/row-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getMessages } from "@/lib/i18n/server";

/**
 * Sources가 서버에서 오는 동안의 골격 (audit-ux #5 · DESIGN §6.64 로딩 행 — 형제 화면도 같은 규칙).
 *
 * ⚠️ **`ContentPanel`을 들지 않는다** — `[slug]/layout.tsx`가 든다.
 *
 * ⚠️ **치수는 `sources-screen.tsx` 그대로다** — 머리(제목 · [Add source]) · `Card` 헤더(`px-4 py-3`,
 * 아래 `border-divider`, 제목 + 개수 배지, 오른쪽 끝 리포 · 브랜치) · 소스 행(`px-4 py-row-y` · 글리프 28 · 본문·경로 두 줄 · 언어 막대 줄 · 상태 ·
 * chevron). 첫 행은 헤더의 선을 쓰고 자기 선이 없다(`first:border-t-0`). 실물에 없는 요소(머리 설명 · 머리 개수 · 행 버튼)를
 * 그리지 않는다 — 도착 순간 폭이 튄다(4-Y16 · 4-Y6).
 * ⚠️ **개수 원은 카드 머리 하나만 그린다**(4-W13) — 실물 `CountBadge`는 0이면 서지 않지만, 골격은 아래 "행은 하나다"와 같은
 * 가정(소스 하나)을 그리고 그때 실물 배지는 선다. 머리의 원은 실물에 총계가 없어 지웠다.
 *
 * ⚠️ **패널 폭 분기가 없다, 실물과 같이** (2026-10-06) — 실물이 패널 1016 이하에서 상태를 셋째 줄로 내리던 분기를 걷었다.
 *   골격이 옛 분기를 남기면 1280(패널 1014)에서 도착 순간 행이 한 줄만큼 줄어든다(malmoi#101의 역방향) — `sibling-loading.test.tsx`가 센다.
 *   responsive-app이 더한 적층은 패널이 아니라 **카드 그릇 640**(`@max-form`)이고 실물과 같은 상수(`components/sources/row-layout.ts`)를 쓴다 — 카드는 `@container`를 여기서도 선언한다.
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
        {/* 실물과 같은 조각이다 — 640 미만에서 실물만 두 줄이면 도착할 때 머리가 44 튄다(A-09). */}
        <div data-skeleton-header className={PANEL_HEAD_ROW}>
          {/* 제목 폭이 실물 `Sources`(68)와 같게. */}
          <div><Skeleton size="lg" className="w-[68px]" /></div>
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </PanelHeader>

      <PanelBody className="space-y-4" aria-hidden>
        <div className="@container border-border bg-background overflow-hidden rounded-lg border">
          <div className="border-divider flex min-h-12 items-center gap-2 border-b px-4 py-3">
            <Skeleton size="md" className="w-16" />
            <Skeleton className="size-5 rounded-full" />
            <div className="ml-auto w-44">
              <Skeleton size="xs" className="w-full" />
            </div>
          </div>
          <div data-skeleton-source className="flex items-center gap-3 pr-4">
            <div className={cn("flex min-w-0 flex-1 items-center gap-3 px-4 py-row-y", SOURCE_CONTENT_STACK)}>
              <Skeleton className="size-7 shrink-0 rounded" />
              <div className="flex min-w-0 flex-1 flex-col gap-copy-gap">
                {/*
                  이름·메타 줄 — 좁은 그릇(`@max-form`)에서는 **두 줄**이다(#295, orch D16). 이름 칸 207에서 실물 `web — JSON catalog · 3 keys · 1 language`가
                  모든 픽스처에서 감겼다(22.5 → 45). 둘째 줄은 같은 블록 안에 둔다 — 실물은 한 요소가 감기는 것이라 줄 사이에 `gap-copy-gap`이 없다.
                */}
                <div data-skeleton-name>
                  <Skeleton size="md" className="w-[42%]" />
                  <div className="hidden @max-form:block"><Skeleton size="md" className="w-[30%]" /></div>
                </div>
                <Skeleton size="xs" className="w-[28%]" />
                {/*
                  언어 막대 자리 둘 — 묶음은 실물과 같은 `mt-2 flex flex-wrap gap-x-3 gap-y-1.5`, 자리 폭은 실물 `LocaleMeter`의 최소 폭 100(`min-w-25`)이다.
                  ⚠️ **두께는 실물과 다르다** — 라벨 16(실물 배지 20) + 간격 6 + 바 8(실물 4) = 30으로 합만 실물(20 + 6 + 4)과 맞춘다. 4px 바는 골격 면에서 선으로 보여
                  바 자리로 읽히지 않는다(시안 프레임 9). `/projects` 골격의 `h-5`·`h-1`(실물 치수 그대로)을 복사하지 않는다.
                  ⚠️ **넓은 그릇은 둘, 좁은 그릇(`@max-form`)은 하나다** (#291·#292) — 375의 실제 카드는 325라 이름 칸이 207이고 막대 둘(212)이 한 줄에 들지 않는다.
                  실물도 그 폭에서 줄당 하나라 둘을 그리면 골격만 두 줄이 된다. 질의는 카드가 이미 선언한 `@container`를 쓴다(새 선언 없음 — POSTMORTEM 2026-09-15).
                  막대가 한 줄을 넘는 소스와 키 0 소스는 도착할 때 한 줄만큼 바뀐다(골격은 언어 수를 모른다).
                */}
                <div data-skeleton-meters className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                  {[0, 1].map(slot => <div key={slot} data-skeleton-meter className={cn("flex w-25 flex-col gap-1.5", slot === 1 && "@max-form:hidden")}>
                    <Skeleton className="h-4 rounded-full" />
                    <Skeleton className="h-2 rounded-full" />
                  </div>)}
                </div>
              </div>
              {/*
                상태 — 넓은 그릇에서는 이름 칸 옆에 서서 행 높이를 이름 칸이 정하므로 줄 자리가 아니라 12 블록이다.
                ⚠️ **좁은 그릇(`@max-form`)에서는 자기 줄로 내려가 높이가 행에 더해진다** — 실물 배지 높이 20(`@max-form:h-5`)을 든다(#295 — 12면 8 모자랐다).
              */}
              <div data-skeleton-status className={cn("shrink-0", SOURCE_STATUS_STACK)}><Skeleton className="h-3 w-24 rounded-md @max-form:h-5" /></div>
            </div>
            <Skeleton className="size-4 shrink-0 rounded" />
          </div>
        </div>
      </PanelBody>
    </div>
  );
}
