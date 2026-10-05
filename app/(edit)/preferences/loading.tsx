import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { getMessages } from "@/lib/i18n/server";

/**
 * Language · Time zone · Theme 카드가 서는 동안의 골격 (ui-locales 시안 B8 — DESIGN §6.67 로딩 골격 규칙).
 *
 * ⚠️ **`ContentPanel`을 들지 않는다** — 패널은 `preferences/layout.tsx`가 든다(`/account`와 같다). 여기서 또 들면 흰 패널이 두 겹이다.
 * ⚠️ **카드 껍데기·머리 padding·디바이더는 실물 값이다** — 움직이는 것은 글자·필드 자리뿐이다. 필드는 실물과 같은 320×36·radius 10이다.
 * ⚠️ **`aria-hidden`은 `Skeleton`이 들고, 접근성 트리에는 낭독 한 줄만 남는다**(형제 화면의 골격과 같은 형).
 */
export default async function PreferencesLoading() {
  const m = await getMessages();
  return (
    <>
      <span className="sr-only" role="status">{m.preferences.loading}</span>
      <PanelHeader aria-hidden>
        {/* 제목 줄은 실물과 같은 min-h-9다 — 머리 높이가 안 튄다. */}
        <div className="flex items-center">
          <Skeleton size="lg" className="w-32" />
        </div>
      </PanelHeader>
      <PanelBody className="space-y-4" aria-hidden>
        <CardSkeleton lines={1} />
        {/* Time zone 카드 — 도움말 아래 미리보기 줄이 하나 더 있다. */}
        <CardSkeleton lines={2} />
        <CardSkeleton lines={1} />
      </PanelBody>
    </>
  );
}

/** 카드 하나 — 머리(제목·설명) + 320 필드 + 그 아래 작은 줄 `lines`개. */
function CardSkeleton({ lines }: { lines: number }) {
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div className="border-divider flex min-h-12 items-center gap-2 border-b px-4 py-3">
        <Skeleton size="md" className="w-20" />
        <div className="ml-auto w-56"><Skeleton size="xs" className="w-full" /></div>
      </div>
      <div className="flex flex-col gap-1.5 px-4 py-3">
        <Skeleton className="h-9 w-80 rounded-md" />
        {Array.from({ length: lines }, (_, i) => <Skeleton key={i} size="xs" className="w-56" />)}
      </div>
    </div>
  );
}
