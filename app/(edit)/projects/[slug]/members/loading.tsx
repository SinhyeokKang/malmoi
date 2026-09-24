import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { m } from "@/lib/i18n";

/**
 * Members가 서버에서 오는 동안의 골격 (audit-ux #5 · DESIGN §6.64 로딩 행 — 형제 화면도 같은 규칙).
 *
 * ⚠️ **`ContentPanel`을 들지 않는다** — `[slug]/layout.tsx`가 든다. 여기서 또 감싸면 로딩 동안 패널이 둘이 된다.
 *
 * ⚠️ **치수는 실물 그대로다** — 머리(`min-h-9` 제목 행) · `RowCard` 헤더(`p-4`, 설명이 같은 줄 오른쪽) · 멤버 행
 * (`py-3.5 pr-3.5 pl-3` · 아바타 32 · 이름 열 300 · 메타 150 · 역할 셀렉트 132 + [Remove]) · 첫 행만 약한 선.
 *
 * ⚠️ **개수는 가장 흔한 모양이다** — 멤버 둘(이름·이메일 두 줄), 대기 초대 0(빈 상태). 실제 수를 맞히려 들면 틀렸을 때
 * 두 번 튄다. 마지막 오너의 사유 띠(OWNER 시점에서 오너 하나인 행)는 그리지 않는다 — 시점마다 갈려 가장 흔한 수가 없다.
 */
export default function MembersLoading() {
  return (
    <>
      <span className="sr-only" role="status">{m.members.loading}</span>
      <PanelHeader width="fluid" aria-hidden>
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <SkeletonLine text="text-lg" className="w-24" />
          <div className="flex items-center gap-3">
            <SkeletonLine text="text-xs" className="w-24" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
        </div>
      </PanelHeader>

      <PanelBody width="fluid" className="space-y-4" aria-hidden>
        <Card>
          {[0, 1].map((i) => (
            <div key={i} data-skeleton-member className={i === 0 ? "border-foreground/[0.06] border-t" : "border-border border-t"}>
              <div className="flex items-center gap-4 py-3.5 pr-3.5 pl-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex w-[300px] min-w-0 shrink-0 flex-col gap-0.5">
                  <SkeletonLine text="text-base" className="w-[45%]" />
                  <SkeletonLine text="text-sm" className="w-[62%]" />
                </div>
                {/* 메타 150 — 행 높이는 이름 열이 정하므로 줄 자리가 아니라 블록 하나다. */}
                <div className="w-[150px] shrink-0">
                  <Skeleton className="h-3 w-[72%] rounded-md" />
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <Skeleton className="h-9 w-[132px] rounded-md" />
                  <Skeleton className="h-9 w-20 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </Card>
        <Card>
          {/*
            `EmptyRowCard inset`과 같은 치수 — `p-8` · 칩 40 · gap 10 · 제목 한 줄 + 설명 **두 줄**. 설명(`max-w-[46ch]` 14px)이
            실물 문구 길이에서 두 줄로 접힌다 — 한 줄로 그리면 도착 때 한 줄만큼 늘어난다.
          */}
          <div data-skeleton-empty className="border-foreground/[0.06] flex flex-col items-center gap-2.5 border-t p-8">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex w-full flex-col items-center gap-1.5">
              <SkeletonLine text="text-base" className="w-48" />
              {["w-80", "w-56"].map((width) => (
                <div key={width} className="flex w-full justify-center text-sm leading-relaxed">
                  {"\u200b"}
                  <Skeleton className={`h-[0.8em] ${width} self-center rounded-md`} />
                </div>
              ))}
            </div>
          </div>
        </Card>
      </PanelBody>
    </>
  );
}

/** `RowCard`의 껍데기와 헤더(제목 · 개수 배지 · 오른쪽 끝 설명). ⚠️ **`<section>`이 아니다** — 이름 없는 골격이다. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-background shrink-0 overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 p-4">
        <SkeletonLine text="text-base" className="w-28" />
        <Skeleton className="h-5 w-5 rounded-full" />
        <div className="ml-auto w-72">
          <SkeletonLine text="text-xs" className="ml-auto w-full" />
        </div>
      </div>
      {children}
    </div>
  );
}
