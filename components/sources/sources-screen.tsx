"use client";
import { Link as InlineLink } from "@/components/ui/link";
import { ListRow } from "@/components/ui/list-row";

import { useRouter } from "next/navigation";
import { ChevronRight, FileCode2, FileJson2, Folder, Plus } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { loadSourceDetail } from "@/app/(edit)/projects/[slug]/sources/actions";
import { runFirstIngest } from "@/app/(edit)/projects/actions";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { GithubIcon } from "@/components/signin/brand-icons";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import { failureText } from "@/components/onboarding/failure";
import { canPerform, type Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { ingestHeadline } from "@/lib/onboarding/message";
import type { AdapterChoice } from "@/lib/onboarding/types";
import { routes } from "@/lib/routes";
import { planSurfaceImportStatus } from "@/lib/import/surface-status";
import type { SourcesData } from "@/lib/sources/query";
import { summarizeAddResults, type SurfaceAdded } from "@/lib/surfaces/plan-add";
import { AddSourcesModal } from "./add-sources-modal";
import { SourceDetailModal, type DetailState } from "./source-detail-modal";
import { SourceStatus } from "./source-status";
import { IconTile } from "@/components/ui/icon-tile";

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
  // 재검증 커밋만으로 클라이언트 상세는 바뀌지 않는다. 화면 소유자는 유지하고 열린 상세만 다시 읽는다 — 첫 적재 뒤의 유일한 재조회다.
  useEffect(() => { if (selection.current) void load(selection.current, true); }, [data, load]);
  useEffect(() => { if (initialOpen && canEdit) setAdding(true); }, [initialOpen, canEdit]);
  const reload = () => { if (selected) void load(selected, true); };
  const closeAdd = () => { setAdding(false); if (initialOpen) router.replace(routes.sources(slug), { scroll: false }); };
  const close = () => { if (busy) return; ++request.current; selection.current = null; setSelected(null); };
  return <div data-sources-screen className="@container/panel flex min-h-0 flex-1 flex-col">
    {/* ⚠️ **좁은 폭 판정을 패널이 든다** (시안 `1h` — 콘텐츠 패널 1016). 카드도 `@container`라
        이름 없는 질의는 카드를 잡는다 — `/panel`이 그 갈림을 막는다. */}
    <PanelHeader><div className="flex items-center gap-3">
      {/* 총계는 카드 머리 한 곳이다(4-Y6) — 바로 아래 카드가 같은 제목·같은 배지를 든다. */}
      <h1 ref={heading} id="sources-heading" tabIndex={-1} className="text-lg font-medium">{m.sources.title}</h1>
      {canEdit && <Button ref={trigger} variant="primary" className="ml-auto" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden />{m.sources.add}</Button>}
    </div></PanelHeader>
    <PanelBody className="space-y-4">
      <Card title={m.sources.title} count={data.sources.length} countLabel={m.sources.count(data.sources.length)}
        description={data.repository ? <span className="flex items-center gap-1.5"><GithubIcon className="size-3.5 shrink-0" />{data.repository.repoOwner}/{data.repository.repoName} · {data.repository.baseBranch}</span> : undefined}
        /*
          ⚠️ **추가 결과는 카드의 첫 줄이다** (시안 `1i`) — 토스트도, 카드 밖 Alert도 아니다. 적재가 토스트보다 오래 걸리고, 닫는 것은 사람이다.
          ⚠️ **계산한 톤을 그린다** (🔴 J — 옛 판은 `tone`을 세워 두고 무색 `role="status"` 줄로 그려 실패가 성공과 같은 줄이었다).
          `Alert inset`이 톤·글리프·닫기 포커스 이동(audit #35)을 들고, 실패는 `alert`로 읽던 것을 끊는다.
        */
        notice={result ? <Alert inset variant={result.tone} live={result.tone === "danger" ? "alert" : "status"} onDismiss={() => setResult(null)}>
          <div className="space-y-copy-gap">
            {result.text && <p>{result.source && <><span className="font-medium">{result.source}</span> — </>}{result.text}</p>}
            {result.added && <><p><span className="font-medium">{m.sources.addedCount(result.added.length)}</span> — {result.added.map((source, index) => <Fragment key={source.surfaceSlug}>
                {index > 0 && ", "}<span className={source.failed > 0 ? "text-destructive" : undefined}>{source.surfaceSlug}</span> {source.failed > 0 ? m.sources.addedFailed : m.sources.addedOne(source.count)}
              </Fragment>)}.</p>
              <p className="text-muted-foreground text-xs">{m.sources.resultKeep}</p>
              <p className="text-muted-foreground text-xs">{m.sources.workflow} <InlineLink href={routes.settings(slug)}>{m.common.nav.projectSettings}</InlineLink></p></>}
          </div>
        </Alert> : undefined}>
        {data.sources.length === 0
          // Card owns the boundary; inset empty content has no top border.
          ? <EmptyState placement="inset" icon={FileJson2} title={m.sources.emptyTitle} description={canEdit ? m.sources.emptyOwner : m.sources.emptyEditor} />
          : <ul>{data.sources.map(source => {
          const Glyph = source.connection?.adapterName === "json-catalog" || source.connection?.adapterName === "chrome-locales" ? FileJson2 : FileCode2;
          // 칸만 상태 톤을 든다 — 행 전체를 칠하면 눈이 먼저 닿는 것이 파일 이름이 아니게 된다. 톤은 배지와 같은 판정이다(🔴 A1).
          const { tone } = planSurfaceImportStatus(source);
          return <li key={source.id} className="border-border border-t first:border-t-0">
            {/* ⚠️ **1016 이하에서 행이 `items-start`가 되고 상태가 셋째 줄로 내려간다** (시안 `1h`).
                상태를 오른쪽에 두면 긴 경로와 버튼 사이에서 먼저 줄바꿈되는 것이 경로가 된다. */}
              <ListRow as="button" ringInset type="button" data-source-row id={`source-row-${source.id}`} aria-expanded={selected === source.slug} disabled={selected === source.slug} className="p-0 pr-4 text-sm transition-colors disabled:cursor-not-allowed disabled:bg-foreground/[0.07] min-w-0 whitespace-normal @max-[1016px]/panel:items-start" onClick={event => {
                returnFocus.current = event.currentTarget; selection.current = source.slug; setSelected(source.slug); void load(source.slug, false);
              }}>
                {/* Content retains its old padding; the chevron keeps the outer gap and top offset inside this button. */}
                <span data-source-content className="flex min-w-0 flex-1 items-center gap-3 px-4 py-row-y @max-[1016px]/panel:items-start">
                  <IconTile data-source-glyph tone={tone}><Glyph className="size-4" aria-hidden /></IconTile>
                  <span className="flex min-w-0 flex-1 flex-col gap-copy-gap"><span className="text-foreground text-base"><span className="font-medium">{source.slug}</span> — {source.connection && <>{source.connection.format ?? (source.connection.adapterName === null ? m.sources.notConfigured : m.sources.unknownFormat)} · </>}{m.surfaces.sourceCounts(source.keys, source.locales)}</span>
                    {/* ⚠️ 경로가 sans다 — mono는 `<pre>` 코드 블록 전용이다 (DESIGN §4.1, 2026-09-23). `text-xs`가 13px라 옛 `text-mono`와 크기는 같다. */}
                    {/* 경로 앞 `Folder` 14 — `/projects` 행 메타의 리포 앞 GitHub 로고와 같은 패턴이다(2026-09-30 사용자). 색은 글자를 상속한다. */}
                    {source.connection && <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs"><Folder className="size-3.5 shrink-0" aria-hidden /><span className="min-w-0 wrap-anywhere">{source.connection.pathTemplate ?? m.sources.notConfigured}</span></span>}
                    <SourceStatus source={source} now={now} className="hidden pt-0.5 @max-[1016px]/panel:flex" />
                  </span>
                  <SourceStatus source={source} now={now} className="@max-[1016px]/panel:hidden" />
                </span>
                {/* [Open translations]는 행에서 걷었다(2026-09-30 사용자) — 번역 화면으로 가는 길은 상세 모달의 같은 버튼이다. */}
                <ChevronRight className="text-muted-foreground size-4 shrink-0 @max-[1016px]/panel:mt-2" aria-hidden />
              </ListRow>
          </li>;
        })}</ul>}
      </Card>
    </PanelBody>
    {canEdit && data.repository && <AddSourcesModal open={adding} onClose={closeAdd} onAdded={added => { const summary = summarizeAddResults(added); setResult({ tone: summary.tone, added }); }} returnFocusRef={trigger} slug={slug} owner={data.repository.repoOwner} repo={data.repository.repoName} branch={data.repository.baseBranch} server={data} existing={data.sources.map(source => ({ pathTemplate: source.connection?.pathTemplate ?? null }))} adapters={adapters} />}
    <SourceDetailModal slug={slug} sourceSlug={selected} role={role} state={detail} now={now} importResult={result?.source === selected && result?.text ? { text: result.text, tone: result.tone } : undefined} busy={busy} importing={importing} onBusy={setBusy} onClose={close} onReload={reload} onSaved={reload} returnFocusRef={returnFocus} fallbackFocusRef={heading} onImport={() => {
      if (!selected || busy) return;
      const surfaceSlug = selected; setBusy(true); setImporting(true);
      void (async () => {
        try {
          const outcome = await runFirstIngest({ slug, surfaceSlug });
          // ⚠️ `not-awaiting`만 직접 다시 읽는다 — 다른 실행이 이미 적재한 갈래라 서버 상태는 바뀌었는데, Action이 `revalidatePath` 전에
          // 반환해 `data`가 안 바뀌고 상세가 옛 [Run first sync]에 남는다. 다른 조기 거부는 바뀐 것이 없어 읽을 것도 없다.
          if (!outcome.ok && outcome.error === "not-awaiting") void load(surfaceSlug, true);
          setResult(outcome.ok ? { tone: outcome.failed > 0 ? "warning" : "success", text: ingestHeadline(m, outcome.count, outcome.failed, outcome.unmanaged), source: surfaceSlug } : { tone: "danger", text: failureText(m, outcome.error), source: surfaceSlug });
        } catch {
          /*
            ⚠️ **"didn't finish"로 접지 않는다** (malmoi#135 — Sync의 #132와 같은 부류) — throw는 요청이 나간 뒤 응답을 잃은 것일 수 있고,
            그때 서버는 적재를 끝냈는데 재검증 트리가 응답과 함께 사라져 상세가 옛 [Run first sync]에 남았다. 다시 실행하지 않는다 —
            서버 상태만 다시 읽는다: refresh가 바꾼 `data`를 아래 effect가 받아 상세를 한 번 읽는다.
            ⚠️ 다시 눌러도 서버가 거부하는 것은 **끝난** 적재뿐이다(`not-awaiting`) — 아직 도는 적재는 `finally`가 `busy`를 refresh 트리보다
            먼저 내려 두 번째 첫 적재와 겹칠 수 있다(둘 다 리포 값만 싣고 아직 편집이 없다).
            ⚠️ **오프라인이면 부르지 않는다** — RSC fetch 실패는 Next의 브라우저 내비게이션(MPA 폴백)이 되어 오류 페이지가 결과를 덮는다.
            온라인의 남은 폴백 갈래(5xx · 세션 만료 302 · 배포 스큐)는 리로드된 화면이 서버 상태를 말하므로 받는다(`sync-button.tsx`).
          */
          setResult({ tone: "warning", text: m.settings.status.unconfirmed, source: surfaceSlug });
          if (navigator.onLine !== false) router.refresh();
        }
        finally { setBusy(false); setImporting(false); }
        /*
          ⚠️ **응답이 온 결과에는 refresh도 직접 재조회도 부르지 않는다** (audit-ux #12 — 위 `not-awaiting`과 응답 유실만 예외). 적재를 시작한 뒤의 성공·실패는 Action의 `finally`가 `revalidatePath`를 부르고,
          그 커밋이 바꾼 `data`를 위 effect가 받아 열린 상세를 **한 번** 다시 읽는다 — 셋을 다 부르면 `loadSourceDetail`이 세 번 돌았다.
          실패 뒤 refresh가 거부를 씻던 함정(audit #11 — POSTMORTEM 2026-09-08 재발)은 호출이 없으니 생기지 않는다.
          ⚠️ async transition으로 감싸지 않는다 — 적재가 긴 동안 내비게이션까지 얽힌다(`sync-button.tsx`).
        */
      })();
    }} />
  </div>;
}
