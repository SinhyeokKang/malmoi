"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileCode2, FileJson2, Plus, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { loadSourceDetail } from "@/app/(edit)/projects/[slug]/sources/actions";
import { runFirstIngest } from "@/app/(edit)/projects/actions";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { PanelCard } from "@/components/ui/panel-card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { neighbourFocus } from "@/components/ui/focus";
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
import { GithubMark } from "./github-mark";
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
  /** `busy`의 **까닭** — 푸터 문장이 그것으로 갈린다 (audit #31: 첫 Sync 중에 "Saving…"이라고 말했다). */
  const [importing, setImporting] = useState(false);
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
  return <div data-sources-screen className="@container/panel flex min-h-0 flex-1 flex-col">
    {/* ⚠️ **좁은 폭 판정을 패널이 든다** (시안 `1h` — 콘텐츠 패널 1016). 카드도 `@container`라
        이름 없는 질의는 카드를 잡는다 — `/panel`이 그 갈림을 막는다. */}
    <PanelHeader width="fluid"><div className="flex items-center gap-3">
      <span className="flex items-center gap-2"><h1 ref={heading} id="sources-heading" tabIndex={-1} className="text-lg font-medium">{m.sources.title}</h1>
        {/* 시안 `1f` — 개수 배지는 0을 그리지 않는다. */}
        {data.sources.length > 0 && <Badge variant="neutral">{data.sources.length}</Badge>}</span>
      {/* ⚠️ `min-w-0`이 없으면 flex 자식의 최소 크기가 min-content라 이 문장이 좁은 폭에서 [Add source]를 민다.
          1016 이하에서는 시안이 이 줄을 **버린다** — 버리는 순서의 첫째다. */}
      <p className="text-muted-foreground min-w-0 text-xs @max-[1016px]/panel:hidden">{m.sources.description}</p>
      {canEdit && <Button ref={trigger} variant="primary" className="ml-auto" onClick={() => setAdding(true)}><Plus className="size-3.5" aria-hidden />{m.sources.add}</Button>}
    </div></PanelHeader>
    <PanelBody width="fluid" className="space-y-4">
      <PanelCard title={m.sources.title} badge={data.sources.length > 0 ? <Badge variant="neutral">{data.sources.length}</Badge> : undefined}
        subtitle={data.repository ? <span className="flex items-center gap-1.5"><GithubMark className="size-3.5 shrink-0" />{data.repository.repoOwner}/{data.repository.repoName} · {data.repository.baseBranch}</span> : undefined}>
        {/* ⚠️ **추가 결과는 카드의 첫 행이다** (시안 `1i`) — 토스트도, 카드 밖 Alert도 아니다. 적재가
            토스트보다 오래 걸리고, 닫는 것은 사람이다. */}
        {result && <div role="status" className="border-divider bg-foreground/2 flex items-start gap-3 border-t px-4 py-[13px]">
          <div className="min-w-0 flex-1 space-y-[3px]">
            {result.text && <p className="text-base">{result.source && <><span className="font-medium">{result.source}</span> — </>}{result.text}</p>}
            {result.added && <><p className="text-base"><span className="font-medium">{m.sources.addedCount(result.added.length)}</span> — {result.added.map((source, index) => <Fragment key={source.surfaceSlug}>
                {index > 0 && ", "}<span className={source.failed > 0 ? "text-destructive" : undefined}>{source.surfaceSlug}</span> {source.failed > 0 ? m.sources.addedFailed : m.sources.addedOne(source.count)}
              </Fragment>)}.</p>
              <p className="text-muted-foreground text-xs">{m.sources.resultKeep}</p>
              <p className="text-muted-foreground text-xs">{m.sources.workflow} <Link className="text-blue-600 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none" href={routes.settings(slug)}>{m.common.nav.projectSettings}</Link></p></>}
          </div>
          {/* ⚠️ 닫기 전에 이웃으로 포커스를 옮긴다 (audit #35) — 이 버튼이 결과 행과 함께 사라져 포커스가 `body`로 빠졌다(`Alert`와 같다). */}
          <Button variant="ghost" aria-label={m.common.close} className="hover:bg-foreground/5 size-7 shrink-0 rounded-full px-0" onClick={event => { neighbourFocus(event.currentTarget.closest('[role="status"]') ?? event.currentTarget)?.focus(); setResult(null); }}><X className="size-4" aria-hidden /></Button>
        </div>}
        {data.sources.length === 0
          ? <div className="border-divider flex flex-col items-center gap-2.5 border-t px-6 py-10 text-center">
              <span className="bg-foreground/4 flex size-9 items-center justify-center rounded-lg text-neutral-600"><FileJson2 className="size-5" aria-hidden /></span>
              <span className="text-base font-medium">{m.sources.emptyTitle}</span>
              <span className="text-muted-foreground max-w-[460px] text-xs leading-[1.7]">{canEdit ? m.sources.emptyOwner : m.sources.emptyEditor}</span>
            </div>
          : <ul>{data.sources.map(source => {
          const actions = planSourceActions({ ...source, role, archived: false, installed: data.installed, pending: busy });
          const openReason = !data.installed ? canEdit ? m.sources.reconnectOwner : m.sources.reconnectEditor : !source.lastCommitSha ? m.sources.firstImport : m.sources.noLanguages;
          const Glyph = source.connection?.adapterName === "json-catalog" || source.connection?.adapterName === "chrome-locales" ? FileJson2 : FileCode2;
          // 시안은 실패한 소스에서 **글리프 칩만** 붉다 — 행 전체를 칠하면 눈이 먼저 닿는 것이 파일 이름이 아니게 된다.
          const failed = planSurfaceImportStatus(source).state.startsWith("failed");
          return <li key={source.id} className="border-border border-t first:border-t-0">
            {/* ⚠️ **1016 이하에서 행이 `items-start`가 되고 상태가 셋째 줄로 내려간다** (시안 `1h`).
                상태를 오른쪽에 두면 긴 경로와 버튼 사이에서 먼저 줄바꿈되는 것이 경로가 된다. */}
            <div className="flex items-center gap-3 pr-4 @max-[1016px]/panel:items-start">
              <Button variant="ghost" type="button" data-source-row id={`source-row-${source.id}`} aria-expanded={selected === source.slug} disabled={selected === source.slug} className="hover:bg-foreground/2 disabled:bg-foreground/3 h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal rounded-none px-4 py-[13px] text-left focus-visible:ring-inset @max-[1016px]/panel:items-start" onClick={event => {
                returnFocus.current = event.currentTarget; selection.current = source.slug; setSelected(source.slug); void load(source.slug, false);
              }}>
                <span data-source-glyph data-tone={failed ? "failed" : "default"} className={cn("flex size-7 shrink-0 items-center justify-center rounded", failed ? "bg-destructive/8 text-destructive" : "bg-foreground/5 text-neutral-600")}><Glyph className="size-4" aria-hidden /></span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]"><span className="text-foreground text-base"><span className="font-medium">{source.slug}</span> — {source.connection && <>{source.connection.format ?? (source.connection.adapterName === null ? m.sources.notConfigured : m.sources.unknownFormat)} · </>}{m.surfaces.sourceCounts(source.keys, source.locales)}</span>
                  {/* ⚠️ 경로가 sans다 — mono는 `<pre>` 코드 블록 전용이다 (DESIGN §4.1, 2026-09-23). `text-xs`가 13px라 옛 `text-mono`와 크기는 같다. */}
                  {source.connection && <span className="text-muted-foreground text-xs [overflow-wrap:anywhere]">{source.connection.pathTemplate ?? m.sources.notConfigured}</span>}
                  <SourceStatus icon source={source} now={now} className="hidden pt-0.5 @max-[1016px]/panel:flex" />
                </span>
                <SourceStatus icon source={source} now={now} className="@max-[1016px]/panel:hidden" />
              </Button>
              {actions.canOpen && source.locales > 0 ? <ButtonLink href={routes.surfaceTranslations(slug, source.slug, { ns: ALL_NAMESPACES })}>{m.sources.open}</ButtonLink>
                : <><span id={`source-open-reason-${source.id}`} className="sr-only">{openReason}</span><Button aria-disabled aria-describedby={`source-open-reason-${source.id}`} onClick={event => event.preventDefault()}>{m.sources.open}</Button></>}
              {/* 시안 순서가 상태 → [Open translations] → chevron이다. 버튼 안에 두면 그 순서를 못 만든다. */}
              <ChevronRight className="size-4 shrink-0 text-neutral-400 @max-[1016px]/panel:mt-2" aria-hidden />
            </div>
          </li>;
        })}</ul>}
      </PanelCard>
    </PanelBody>
    {canEdit && data.repository && <AddSourcesModal open={adding} onClose={closeAdd} onAdded={added => { const summary = summarizeAddResults(added); setResult({ tone: summary.tone, added }); router.refresh(); }} returnFocusRef={trigger} slug={slug} owner={data.repository.repoOwner} repo={data.repository.repoName} branch={data.repository.baseBranch} existing={data.sources.map(source => ({ pathTemplate: source.connection?.pathTemplate ?? null }))} adapters={adapters} />}
    <SourceDetailModal slug={slug} sourceSlug={selected} role={role} state={detail} now={now} importResult={result?.source === selected && result?.text ? { text: result.text, tone: result.tone } : undefined} busy={busy} importing={importing} onBusy={setBusy} onClose={close} onReload={reload} onSaved={reload} returnFocusRef={returnFocus} fallbackFocusRef={heading} onImport={() => {
      if (!selected || busy) return;
      const surfaceSlug = selected; setBusy(true); setImporting(true);
      void (async () => {
        try {
          const outcome = await runFirstIngest({ slug, surfaceSlug });
          setResult(outcome.ok ? { tone: outcome.failed > 0 ? "warning" : "success", text: ingestHeadline(outcome.count, outcome.failed, outcome.unmanaged), source: surfaceSlug } : { tone: "danger", text: failureText(outcome.error), source: surfaceSlug });
          /*
            ⚠️ **refresh는 성공에만 부른다** (audit #11 — POSTMORTEM 2026-09-08 재발). 세션이 끊긴 거부 직후의 refresh는
            미들웨어에 걸려 로그인 이동이 되고 방금 세운 거부를 씻어 간다. 서버에 남은 실패 상태는 아래 재조회가 읽고,
            목록은 Action의 `finally`가 부르는 `revalidatePath`가 갱신한다.
          */
          void load(surfaceSlug, true);
          if (outcome.ok) router.refresh();
        } catch { setResult({ tone: "danger", text: m.settings.status.failed, source: surfaceSlug }); }
        finally { setBusy(false); setImporting(false); }
      })();
    }} />
  </div>;
}
