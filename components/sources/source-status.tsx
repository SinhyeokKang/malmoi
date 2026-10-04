"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import { planSurfaceImportStatus } from "@/lib/import/surface-status";
import { relativeTime } from "@/lib/relative-time";
import { utcMinute } from "@/lib/utc-time";
import { cn } from "@/lib/utils";
import { useUiLocale } from "@/components/i18n/messages-provider";

/** Sources 목록 행의 적재 상태 배지 — 낱말 하나(+ 동기화 중이면 시작 시각)다. */
export function SourceStatus({ source, now, className }: { source: Parameters<typeof planSurfaceImportStatus>[0]; now: Date; className?: string }) {
  const uiLocale = useUiLocale();
  const status = planSurfaceImportStatus(source);
  /*
    ⚠️ **배지다** (2026-09-30 사용자 — 글리프 + 12~13px 글자에서 바꿨다). 낱말·variant는 상태 키가 든다(`StatusBadge` — §2.4):
    일부 반영은 실패가 아니라 호박 `Partially synced`다(🔴 A1 — 판정은 `planSurfaceImportStatus`가 `importFailureTone`으로 한다).
    ⚠️ **배지 안에 글리프·시각을 넣지 않는다**(§2.4 — 배지는 낱말뿐이다). 진행 중 시각은 배지 옆 muted 글자다.
  */
  // 반응형 표시 클래스(`hidden … :flex`)와 `data-source-status`는 바깥 칸이 든다 — `StatusBadge`는 둘 다 받지 않는다.
  return <span data-source-status={status.state} className={cn("flex shrink-0 items-center gap-1.5", className)}>
    <StatusBadge state={status.labelKey} />
    {/* ⚠️ 상대 시각도 절대 값을 든다 (audit #41 — DESIGN §6.66·§6.68) — 화면의 낱말이 "5분 전"이어도 접근 이름은 UTC다. */}
    {status.state === "importing" && status.at !== null && <time className="text-muted-foreground text-xs" dateTime={status.at.toISOString()} aria-label={utcMinute(status.at, uiLocale)}>{relativeTime(status.at, now, uiLocale)}</time>}
  </span>;
}
