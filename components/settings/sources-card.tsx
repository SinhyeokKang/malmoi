"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileCode2, FileJson2, Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { runFirstIngest } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/ui/panel-card";
import { failureText } from "@/components/onboarding/failure";
import { m } from "@/lib/i18n";
import { planSurfaceImportStatus } from "@/lib/import/surface-status";
import { ingestHeadline } from "@/lib/onboarding/message";
import { planSurfaceReadiness } from "@/lib/onboarding/readiness";
import type { AdapterChoice } from "@/lib/onboarding/types";
import { importFailureMessage, isImportFailureCode } from "@/lib/projects/import-failure";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";
import { formatSourceCounts, summarizeAddResults, type SurfaceAdded } from "@/lib/surfaces/plan-add";
import { AddSourcesModal } from "./add-sources-modal";

type Source = Parameters<typeof planSurfaceImportStatus>[0] & { id: string; slug: string; pathTemplate: string | null };
export function SourcesCard({ slug, owner, repo, branch, installationId, archived, sources, counts, adapters, now, initialOpen = false }: {
  slug: string; owner: string; repo: string; branch: string; installationId: string | null; archived: boolean; sources: Source[];
  counts: { surfaceId: string; keys: number; locales: number }[]; adapters: AdapterChoice[]; now: Date; initialOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen && !archived);
  const trigger = useRef<HTMLButtonElement>(null);
  const [pending, run] = useTransition();
  const [running, setRunning] = useState<string>();
  const [result, setResult] = useState<{ tone: "success" | "warning" | "danger"; text: string; added?: boolean }>();
  const close = () => { setOpen(false); if (initialOpen) router.replace(routes.settings(slug), { scroll: false }); };
  return <PanelCard title={m.settings.sources.title} badge={<Badge variant="neutral">{sources.length}</Badge>} subtitle={<Button className="[&_.animate-spin]:size-3.5" ref={trigger} disabled={archived || pending} aria-describedby={archived ? "sources-archived" : undefined} onClick={() => setOpen(true)}><Plus aria-hidden />{m.settings.sources.add}</Button>}>
    {archived && <p id="sources-archived" className="text-muted-foreground px-4 py-3 text-xs">{m.settings.archivedReason}</p>}
    {sources.length === 0 ? <div className="space-y-1 p-4"><p className="text-sm">{m.settings.sources.empty}</p><p className="text-muted-foreground text-xs">{m.settings.sources.emptyHelp}</p></div> : <ul>
      {sources.map(source => {
        const status = planSurfaceImportStatus(source);
        const count = counts.find(c => c.surfaceId === source.id) ?? { keys: 0, locales: 0 };
        const canRetry = status.canRetry && planSurfaceReadiness({ installationId, surface: source }) === "awaiting_first_sync";
        const failed = status.state === "failed-first" || status.state === "failed-after";
        const text = status.state === "imported" ? m.settings.sources.imported : status.state === "importing" ? m.settings.sources.importing : status.state === "failed-after" ? m.settings.sources.failedAfter : status.state === "failed-first" ? m.settings.sources.failed : m.settings.sources.notImported;
        const Glyph = source.pathTemplate?.endsWith(".json") ? FileJson2 : FileCode2;
        return <li key={source.id} className="border-border border-t first:border-t-0">
          <div className="flex items-center gap-3 pr-4 @max-[640px]:flex-wrap @max-[640px]:[&>button]:mb-3 @max-[640px]:[&>button]:ml-14">
            <Link href={routes.surfaceTranslations(slug, source.slug)} className="focus-visible:ring-ring grid min-w-0 flex-1 grid-cols-[28px_1fr_auto_16px] items-center gap-x-3 gap-y-[3px] px-4 py-[13px] @max-[640px]:basis-full @max-[640px]:grid-cols-[28px_1fr_16px] hover:bg-foreground/2 focus-visible:ring-inset focus-visible:ring-2 focus-visible:outline-none">
              <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded"><Glyph className="size-4" aria-hidden /></span>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]"><span className="text-base"><span className="font-medium">{source.slug}</span> — {formatSourceCounts(count)}</span><span className="text-mono text-muted-foreground break-all text-xs">{source.pathTemplate ?? source.slug}</span></span>
              <span className={`text-xs @max-[640px]:col-start-2 @max-[640px]:row-start-2 ${failed ? "text-destructive" : "text-muted-foreground"}`}>{text}{status.at && <> {relativeTime(status.at, now)}</>}</span>
              <ChevronRight className="text-muted-foreground size-4 shrink-0 @max-[640px]:col-start-3 @max-[640px]:row-start-1" aria-hidden />
            </Link>
            {status.canRetry && <Button className="[&_.animate-spin]:size-3.5" disabled={!canRetry || archived || pending} aria-describedby={`source-${source.id}-reason`} loading={pending && running === source.slug} aria-busy={pending && running === source.slug} onClick={() => {
              setRunning(source.slug); setResult(undefined);
              run(async () => { try {
                const outcome = await runFirstIngest({ slug, surfaceSlug: source.slug });
                setResult(outcome.ok ? { tone: outcome.failed > 0 ? "warning" : "success", text: ingestHeadline(outcome.count, outcome.failed) } : { tone: "danger", text: failureText(outcome.error) });
              } catch { setResult({ tone: "danger", text: m.settings.status.failed }); } });
            }}>{m.settings.sources.retry}</Button>}
          </div>
          {(failed || status.canRetry) && <p id={`source-${source.id}-reason`} className="text-muted-foreground px-4 pb-[13px] text-xs">{archived ? m.settings.archivedReason : !installationId ? m.settings.status.setup : pending ? m.settings.status.running : failed && isImportFailureCode(source.lastImportError) ? <>{importFailureMessage(source.lastImportError)} {status.state === "failed-after" ? m.settings.sources.rerun : m.settings.status.importRetry}</> : m.settings.status.awaiting}</p>}
        </li>;
      })}
    </ul>}
    {/* Keep outcomes outside the rows: refreshed import state can remove the retry button. */}
    {result && <Alert inset variant={result.tone} role="status"><p>{result.text}</p>{result.added && <p>{m.settings.sources.yamlReminder}</p>}</Alert>}
    <AddSourcesModal open={open && !archived} onClose={close} returnFocusRef={trigger} slug={slug} owner={owner} repo={repo} branch={branch} existing={sources} adapters={adapters} onAdded={(results: SurfaceAdded[]) => {
      const summary = summarizeAddResults(results);
      setResult({ tone: summary.tone, text: `${m.settings.sources.added(summary.surfaces)} ${ingestHeadline(summary.keys, summary.failed)}`, added: true });
      router.refresh();
    }} />
  </PanelCard>;
}
