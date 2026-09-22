import { m } from "@/lib/i18n";
import { planSurfaceImportStatus } from "@/lib/import/surface-status";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

export function SourceStatus({ source, now }: { source: Parameters<typeof planSurfaceImportStatus>[0]; now: Date }) {
  const status = planSurfaceImportStatus(source);
  const labels = { "not-imported": m.settings.sources.notImported, importing: m.settings.sources.importing, "failed-first": m.settings.sources.failed, "failed-after": m.settings.sources.failedAfter, imported: m.settings.sources.imported };
  return <span className={cn("text-xs", status.state.startsWith("failed") ? "text-destructive" : "text-muted-foreground")}>
    {labels[status.state]}{status.state === "importing" && status.at !== null && <> · {relativeTime(status.at, now)}</>}
  </span>;
}
