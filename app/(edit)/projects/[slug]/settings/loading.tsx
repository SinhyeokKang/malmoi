import type { ReactNode } from "react";

import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { m } from "@/lib/i18n";

/**
 * Settings가 서버에서 오는 동안의 골격 (audit-ux #5 · DESIGN §6.64 로딩 행 — 형제 화면도 같은 규칙).
 *
 * ⚠️ **`ContentPanel`을 들지 않는다** — `[slug]/layout.tsx`가 든다. ⚠️ **폭 등급이 `limited`다** — 실물이 그렇다.
 *
 * ⚠️ **이 화면은 GitHub을 기다린다** (연결 상태 probe · 열린 PR — 대기 시간 자체는 U5의 몫이다). 골격이 서 있는 시간이
 * 길어 실물과 어긋나면 그만큼 오래 어긋나 보인다 — 카드 넷의 순서·행 수가 OWNER의 기본 모양 그대로다
 * (General 셋 · Repository 상태 + 기준 브랜치 · CI 셋 · Archive 하나). 조건부 알림(`notice`·복구 줄·보관 사유)은 그리지 않는다.
 *
 * ⚠️ **사실 표의 두 열(96 + 값)은 카드 폭 640 이상의 모양이다** — 셸이 최소 1280이라 `limited` 카드가 그 아래로 안 좁는다.
 */
export default function SettingsLoading() {
  return (
    <>
      <span className="sr-only" role="status">{m.settings.loading}</span>
      <PanelHeader aria-hidden>
        <div className="flex min-h-9 items-center">
          <SkeletonLine text="text-lg" className="w-20" />
        </div>
      </PanelHeader>

      <PanelBody className="space-y-4" aria-hidden>
        <Card title="w-16">
          <Fact>
            <div className="flex items-center gap-4">
              <Skeleton className="size-14 shrink-0 rounded-sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-20 rounded-md" />
                  <Skeleton className="h-9 w-20 rounded-md" />
                </div>
                <SkeletonLine text="text-xs" className="w-[80%]" />
              </div>
            </div>
          </Fact>
          <Fact divided>
            <Field button />
          </Fact>
          <Fact divided>
            <Field />
          </Fact>
        </Card>

        <Card title="w-24" subtitle>
          <Row action />
          <div className="border-border bg-muted border-t pl-10">
            <div className="flex items-center gap-x-3 px-4 py-3.5">
              <SkeletonLine text="text-sm" className="w-24" />
              <Skeleton className="h-9 w-60 shrink-0 rounded-md" />
              <Skeleton className="h-9 w-16 shrink-0 rounded-md" />
              <SkeletonLine text="text-xs" className="w-[60%]" />
            </div>
          </div>
        </Card>

        <Card title="w-28" subtitle>
          <Row action />
          <div className="border-border border-t">
            <Row chevron />
          </div>
          <div className="border-border border-t px-4 py-[13px]">
            <SkeletonLine text="text-xs" className="w-[55%]" />
          </div>
        </Card>

        <Card title="w-28">
          <div className="flex items-center justify-between gap-4 px-4 py-[13px]">
            <Skeleton className="size-7 shrink-0 rounded" />
            <div className="flex-1">
              <SkeletonLine text="text-xs" className="w-[45%]" />
            </div>
            <Skeleton className="h-9 w-36 shrink-0 rounded-md" />
          </div>
        </Card>
      </PanelBody>
    </>
  );
}

/** `PanelCard` 껍데기 + 헤더(제목 · 오른쪽 끝 부제). 헤더 아래 선은 `border-divider`다. */
function Card({ title, subtitle = false, children }: { title: string; subtitle?: boolean; children: ReactNode }) {
  return (
    <div data-skeleton-card className="border-border bg-background overflow-hidden rounded-lg border">
      <div className="border-divider flex items-center gap-2 border-b p-4">
        <SkeletonLine text="text-base" className={title} />
        {subtitle && (
          <div className="ml-auto w-[48%]">
            <SkeletonLine text="text-xs" className="ml-auto w-full" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** `PanelFacts` 한 칸 — 라벨 96 + 값. `divided`는 둘째 칸부터의 윗선이다. */
function Fact({ divided = false, children }: { divided?: boolean; children: ReactNode }) {
  return (
    <div className={divided ? "border-border border-t" : undefined}>
      <div className="grid grid-cols-[96px_1fr] items-center gap-x-3 px-4 py-3.5">
        <SkeletonLine text="text-xs" className="w-16" />
        {children}
      </div>
    </div>
  );
}

/** 이름·주소 칸 — 입력 320 (+ [Save]) + 도움말. */
function Field({ button = false }: { button?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Skeleton className="h-9 w-[320px] shrink-0 rounded-md" />
      {button && <Skeleton className="h-9 w-16 shrink-0 rounded-md" />}
      <div className="min-w-0 flex-1">
        <SkeletonLine text="text-xs" className="w-[80%]" />
      </div>
    </div>
  );
}

/** 글리프 28 + 두 줄 + 오른쪽 버튼(또는 chevron) 행 — `px-4 py-[13px]`. */
function Row({ action = false, chevron = false }: { action?: boolean; chevron?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-[13px]">
      <Skeleton className="size-7 shrink-0 rounded" />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <SkeletonLine text="text-base" className="w-[40%]" />
        <SkeletonLine text="text-xs" className="w-[60%]" />
      </div>
      {action && <Skeleton className="h-9 w-36 shrink-0 rounded-md" />}
      {chevron && <Skeleton className="size-4 shrink-0 rounded" />}
    </div>
  );
}
