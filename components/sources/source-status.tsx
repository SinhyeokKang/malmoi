import { Badge } from "@/components/ui/badge";
import { m } from "@/lib/i18n";
import { planSurfaceImportStatus } from "@/lib/import/surface-status";
import { relativeTime } from "@/lib/relative-time";
import { utcMinute } from "@/lib/utc-time";
import { cn } from "@/lib/utils";

/** Sources 목록 행의 적재 상태 배지 — 낱말 하나(+ 동기화 중이면 시작 시각)다. */
export function SourceStatus({ source, now, className }: { source: Parameters<typeof planSurfaceImportStatus>[0]; now: Date; className?: string }) {
  const status = planSurfaceImportStatus(source);
  const labels = { "not-imported": m.settings.sources.notImported, importing: m.settings.sources.importing, "failed-first": m.settings.sources.failed, "failed-after": m.settings.sources.failedAfter, imported: m.settings.sources.imported };
  const failed = status.state.startsWith("failed");
  /*
    ⚠️ **배지다** (2026-09-30 사용자 — 글리프 + 12~13px 글자에서 바꿨다). 정상 초록 · 진행·미적재 무색 · 실패는 붉은 채움 알약(`missing`).
    ⚠️ **글리프를 넣지 않는다**(같은 날 사용자 — 실패 배지만 아이콘을 들어 혼자 튀었다). 색각 이상에서는 배지의 낱말(`Last sync failed`)이 상태를 든다.
  */
  // 일부만 반영된 적재는 실패가 아니라 호박 `Partially synced`다(2026-09-30 상태 통일 — `importFailureTone`).
  const partial = failed && source.lastImportError === "partial-import";
  const variant = partial ? "warning" : failed ? "missing" : status.state === "imported" ? "success" : "neutral";
  // 반응형 표시 클래스(`hidden … :flex`)와 `data-source-status`는 바깥 칸이 든다 — `Badge`는 둘 다 받지 않는다.
  return <span data-source-status={status.state} className={cn("flex shrink-0 items-center", className)}><Badge variant={variant} >
    {/* ⚠️ 상대 시각도 절대 값을 든다 (audit #41 — DESIGN §6.66·§6.68) — 화면의 낱말이 "5분 전"이어도 접근 이름은 UTC다. */}
    {partial ? m.logs.status.partial : labels[status.state]}{status.state === "importing" && status.at !== null && <> · <time dateTime={status.at.toISOString()} aria-label={utcMinute(status.at)}>{relativeTime(status.at, now)}</time></>}
  </Badge></span>;
}
