import { CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { m } from "@/lib/i18n";
import { planSurfaceImportStatus } from "@/lib/import/surface-status";
import { relativeTime } from "@/lib/relative-time";
import { utcMinute } from "@/lib/utc-time";
import { cn } from "@/lib/utils";

/**
 * ⚠️ **글리프는 `icon`을 준 자리에만 선다.** 상세 모달은 이 줄을 `Alert` **안에서** 쓰고
 * `alert.tsx`가 variant마다 아이콘을 이미 그리므로, 여기서도 그리면 경고 삼각형 옆에 경고 원이
 * 나란히 선다 (2026-09-22 `/design-sync` 리뷰). 목록 행에는 그 그릇이 없어 이 줄이 유일한 신호다.
 */
export function SourceStatus({ source, now, icon = false, className }: { source: Parameters<typeof planSurfaceImportStatus>[0]; now: Date; icon?: boolean; className?: string }) {
  const status = planSurfaceImportStatus(source);
  const labels = { "not-imported": m.settings.sources.notImported, importing: m.settings.sources.importing, "failed-first": m.settings.sources.failed, "failed-after": m.settings.sources.failedAfter, imported: m.settings.sources.imported };
  const failed = status.state.startsWith("failed");
  /*
    ⚠️ **배지다** (2026-09-30 사용자 — 글리프 + 12~13px 글자에서 바꿨다). 정상 초록 · 진행·미적재 무색 · 실패는 붉은 채움 알약(`missing`의 면을 빌린다 —
    `danger` variant는 배경 없는 글자라 배지로 안 읽힌다). 글리프는 그대로 든다 — 색각 이상에서 모양이 상태를 든다.
  */
  const variant = failed ? "missing" : status.state === "imported" ? "success" : "neutral";
  // 반응형 표시 클래스(`hidden … :flex`)와 `data-source-status`는 바깥 칸이 든다 — `Badge`는 둘 다 받지 않는다.
  return <span data-source-status={status.state} className={cn("flex shrink-0 items-center", className)}><Badge variant={variant} className="gap-1">
    {/* 색각 이상에서 정상과 실패가 같은 회색 문장이 되지 않게, 색이 아니라 모양이 상태를 든다. */}
    {icon && failed && <CircleAlert className="size-3 shrink-0" aria-hidden />}
    {icon && status.state === "importing" && <span aria-hidden className="border-foreground/15 border-t-muted-foreground size-3 shrink-0 animate-spin rounded-full border-2 [animation-duration:0.7s]" />}
    {/* ⚠️ 상대 시각도 절대 값을 든다 (audit #41 — DESIGN §6.66·§6.68) — 화면의 낱말이 "5분 전"이어도 접근 이름은 UTC다. */}
    {labels[status.state]}{status.state === "importing" && status.at !== null && <> · <time dateTime={status.at.toISOString()} aria-label={utcMinute(status.at)}>{relativeTime(status.at, now)}</time></>}
  </Badge></span>;
}
