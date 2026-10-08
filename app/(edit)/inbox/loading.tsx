import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { getMessages } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/**
 * 프로젝트 카드가 서는 동안의 골격 (DESIGN §6.67 로딩 골격 규칙) — 실물(`InboxList`)과 같은 카드·행 배치다.
 *
 * ⚠️ **`ContentPanel`을 들지 않는다** — 패널은 `inbox/layout.tsx`가 든다. 여기서 또 들면 흰 패널이 두 겹이다.
 * ⚠️ **카드 머리·행 칸은 실물 값이다** — 머리는 `Card`(min-h-12 · px-4 py-3 · 썸네일 16 + 이름), 행은 Home 할 일 카드 골격과 같은
 * `ListRow` 형(IconTile 28 · 문장 + 보조줄 두 줄 · 시각)이다. 선은 첫 행이 머리 선(`--divider`), 행↔행은 `--border`.
 * ⚠️ **`aria-hidden`은 `Skeleton`이 들고, 접근성 트리에는 낭독 한 줄만 남는다**(형제 화면의 골격과 같은 형).
 */
export default async function InboxLoading() {
  const m = await getMessages();
  return (
    <>
      <span className="sr-only" role="status">{m.inbox.loading}</span>
      <PanelHeader aria-hidden>
        <div className="flex items-center">
          <Skeleton size="lg" className="w-20" />
        </div>
      </PanelHeader>
      <PanelBody className="space-y-4" aria-hidden>
        <CardSkeleton rows={3} />
        <CardSkeleton rows={2} />
      </PanelBody>
    </>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <section className="border-border overflow-hidden rounded-lg border">
      <div className="flex min-h-12 items-center gap-2 px-4 py-3">
        <Skeleton className="size-4 shrink-0 rounded" />
        <Skeleton size="md" className="w-32" />
      </div>
      <ul>
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className={cn("flex items-center gap-3 border-t px-4 py-row-y", i === 0 ? "border-divider" : "border-border")}>
            <Skeleton className="size-7 shrink-0 rounded" />
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-copy-gap">
              <Skeleton size="md" className="w-[72%]" />
              <Skeleton size="xs" lineHeight="normal" className="w-[62%]" />
            </span>
            <Skeleton size="xs" className="w-16" />
            <Skeleton className="size-4 shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  );
}
