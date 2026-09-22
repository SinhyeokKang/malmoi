"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileCode2, FileJson2, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadSourceDetail } from "@/app/(edit)/projects/[slug]/sources/actions";
import { runFirstIngest } from "@/app/(edit)/projects/actions";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { PanelCard } from "@/components/ui/panel-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { LocaleMeter } from "@/components/locale-meter";
import { failureText } from "@/components/onboarding/failure";
import { canPerform, type Role } from "@/lib/auth/permission";
import { cn } from "@/lib/utils";
import { m } from "@/lib/i18n";
import { ingestHeadline } from "@/lib/onboarding/message";
import type { AdapterChoice } from "@/lib/onboarding/types";
import { routes, ALL_NAMESPACES } from "@/lib/routes";
import { planSurfaceImportStatus } from "@/lib/import/surface-status";
import { planSourceActions } from "@/lib/sources/actions";
import type { SourcesData } from "@/lib/sources/query";
import { summarizeAddResults, type SurfaceAdded } from "@/lib/surfaces/plan-add";
import { AddSourcesModal } from "./add-sources-modal";
import { SourceDetailModal, type DetailState } from "./source-detail-modal";
import { SourceStatus } from "./source-status";

type Result = { tone: "success" | "warning" | "danger"; text?: string; added?: SurfaceAdded[]; source?: string };
export function SourcesScreen({ slug, role, data, adapters, now, initialOpen = false }: {
  slug: string; role: Role; data: SourcesData; adapters: AdapterChoice[]; now: Date; initialOpen?: boolean;
}) {
  const router = useRouter();
  const canEdit = canPerform(role, "project:settings");
  const [adding, setAdding] = useState(initialOpen && canEdit);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const request = useRef(0);
  const selection = useRef<string | null>(null);
  const load = useCallback(async (surfaceSlug: string, preserve: boolean) => {
    const sequence = ++request.current;
    if (!preserve) setDetail({ status: "loading" });
    try {
      const outcome = await loadSourceDetail({ slug, surfaceSlug });
      if (sequence !== request.current || selection.current !== surfaceSlug) return;
      if ("ok" in outcome) setDetail({ status: "ready", detail: outcome.detail });
      else if ("rejected" in outcome) setDetail({ status: "rejected" });
      else setDetail(previous => preserve && previous.status === "ready" ? { ...previous, refreshFailed: true } : { status: "failed" });
    } catch {
      if (sequence === request.current && selection.current === surfaceSlug) setDetail(previous => preserve && previous.status === "ready" ? { ...previous, refreshFailed: true } : { status: "failed" });
    }
  }, [slug]);
  // RSC refresh만으로 클라이언트 상세는 바뀌지 않는다. 화면 소유자는 유지하고 열린 상세만 다시 읽는다.
  useEffect(() => { if (selection.current) void load(selection.current, true); }, [data, load]);
  useEffect(() => { if (initialOpen && canEdit) setAdding(true); }, [initialOpen, canEdit]);
  const reload = () => { if (selected) void load(selected, true); };
  const closeAdd = () => { setAdding(false); if (initialOpen) router.replace(routes.sources(slug), { scroll: false }); };
  const close = () => { if (busy) return; ++request.current; selection.current = null; setSelected(null); };
  return <div data-sources-screen className="flex min-h-0 flex-1 flex-col">
    <PanelHeader><div className="flex items-center gap-3">
      <h1 ref={heading} id="sources-heading" tabIndex={-1} className="text-lg font-medium">{m.sources.title}</h1><Badge variant="neutral">{data.sources.length}</Badge>
      <p className="text-muted-foreground text-xs">{m.sources.description}</p>
      {canEdit && <Button ref={trigger} variant="primary" className="ml-auto" onClick={() => setAdding(true)}><Plus aria-hidden />{m.sources.add}</Button>}
    </div></PanelHeader>
    <PanelBody className="space-y-4">
      <div>{result && <Alert inset role="status" variant={result.tone} onDismiss={() => setResult(null)}>
        {result.text && <p>{result.source && <>{result.source}: </>}{result.text}</p>}
        {result.added && <><ul>{result.added.map(source => <li key={source.surfaceSlug}>{m.sources.added(source.surfaceSlug, source.count, source.failed)}</li>)}</ul><p className="mt-2">{m.sources.workflow} <Link className="text-link" href={routes.settings(slug)}>{m.common.nav.projectSettings}</Link></p></>}
      </Alert>}</div>
      <PanelCard title={m.sources.title} badge={<Badge variant="neutral">{data.sources.length}</Badge>} subtitle={data.repository ? `${data.repository.repoOwner}/${data.repository.repoName} · ${data.repository.baseBranch}` : undefined}>
        {data.sources.length === 0 ? <p className="text-muted-foreground p-4 text-sm">{canEdit ? m.sources.emptyOwner : m.sources.emptyEditor}</p> : <ul>{data.sources.map(source => {
          const actions = planSourceActions({ ...source, role, archived: false, installed: data.installed, pending: busy });
          const openReason = !data.installed ? canEdit ? m.sources.reconnectOwner : m.sources.reconnectEditor : !source.lastCommitSha ? m.sources.firstImport : m.sources.noLanguages;
          const Glyph = source.connection?.adapterName === "json-catalog" || source.connection?.adapterName === "chrome-locales" ? FileJson2 : FileCode2;
          // 시안은 실패한 소스에서 **글리프 칩만** 붉다 — 행 전체를 칠하면 눈이 먼저 닿는 것이 파일 이름이 아니게 된다.
          const failed = planSurfaceImportStatus(source).state.startsWith("failed");
          return <li key={source.id} className="border-border border-t first:border-t-0">
            <div className="flex items-center gap-3 pr-4">
              <Button variant="ghost" type="button" data-source-row id={`source-row-${source.id}`} aria-expanded={selected === source.slug} disabled={selected === source.slug} className="hover:bg-foreground/2 disabled:bg-foreground/3 h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal rounded-none px-4 py-[13px] text-left focus-visible:ring-inset" onClick={event => {
                returnFocus.current = event.currentTarget; selection.current = source.slug; setSelected(source.slug); void load(source.slug, false);
              }}>
                <span data-source-glyph data-tone={failed ? "failed" : "default"} className={cn("flex size-7 shrink-0 items-center justify-center rounded", failed ? "bg-destructive/8 text-destructive" : "bg-foreground/5")}><Glyph className="size-4" aria-hidden /></span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]"><span className="text-foreground text-base"><span className="font-medium">{source.slug}</span> — {source.connection && <>{source.connection.format ?? (source.connection.adapterName === null ? m.sources.notConfigured : m.sources.unknownFormat)} · </>}{m.surfaces.sourceCounts(source.keys, source.locales)}</span>
                  {source.connection && <span className="text-mono text-muted-foreground break-all">{source.connection.pathTemplate ?? m.sources.notConfigured}</span>}
                  <span className="flex items-center gap-3"><LocaleMeter locale={{ surfaceSlug: source.slug, code: "", isBase: false, ...source.progress }} />{source.orphanedLocales > 0 && <Badge variant="danger">{m.sources.missing(source.orphanedLocales)}</Badge>}</span>
                </span>
                <SourceStatus icon source={source} now={now} /><ChevronRight className="size-4 shrink-0 text-neutral-400" aria-hidden />
              </Button>
              {actions.canOpen && source.locales > 0 ? <ButtonLink href={routes.surfaceTranslations(slug, source.slug, { ns: ALL_NAMESPACES })}>{m.sources.open}</ButtonLink> : <Button disabled title={openReason}>{m.sources.open}</Button>}
            </div>
          </li>;
        })}</ul>}
      </PanelCard>
    </PanelBody>
    {canEdit && data.repository && <AddSourcesModal open={adding} onClose={closeAdd} onAdded={added => { const summary = summarizeAddResults(added); setResult({ tone: summary.tone, added }); router.refresh(); }} returnFocusRef={trigger} slug={slug} owner={data.repository.repoOwner} repo={data.repository.repoName} branch={data.repository.baseBranch} existing={data.sources.map(source => ({ pathTemplate: source.connection?.pathTemplate ?? null }))} adapters={adapters} />}
    <SourceDetailModal slug={slug} sourceSlug={selected} role={role} state={detail} now={now} importResult={result?.source === selected && result?.text ? { text: result.text, tone: result.tone } : undefined} busy={busy} onBusy={setBusy} onClose={close} onReload={reload} onSaved={reload} returnFocusRef={returnFocus} fallbackFocusRef={heading} onImport={() => {
      if (!selected || busy) return;
      const surfaceSlug = selected; setBusy(true);
      void (async () => {
        try {
          const outcome = await runFirstIngest({ slug, surfaceSlug });
          setResult(outcome.ok ? { tone: outcome.failed > 0 ? "warning" : "success", text: ingestHeadline(outcome.count, outcome.failed), source: surfaceSlug } : { tone: "danger", text: failureText(outcome.error), source: surfaceSlug });
          void load(surfaceSlug, true); router.refresh();
        } catch { setResult({ tone: "danger", text: m.settings.status.failed, source: surfaceSlug }); }
        finally { setBusy(false); }
      })();
    }} />
  </div>;
}
