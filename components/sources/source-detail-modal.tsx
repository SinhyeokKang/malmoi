"use client";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, Clock, Lock } from "lucide-react";
import { Fragment, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { OnboardingModal } from "@/components/ui/modal";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { PanelCard } from "@/components/ui/panel-card";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { LocaleFlag } from "@/components/translations/locale-badge";
import { relativeTime } from "@/lib/relative-time";
import { CopyButton } from "@/components/onboarding/copy-button";
import { canPerform, type Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { planSurfaceImportStatus } from "@/lib/import/surface-status";
import { basePending } from "@/lib/onboarding/base-pending";
import { importFailureMessage, isImportFailureCode } from "@/lib/projects/import-failure";
import { routes, ALL_NAMESPACES } from "@/lib/routes";
import { planSourceActions } from "@/lib/sources/actions";
import type { SourceDetail } from "@/lib/sources/query";
import { utcMinute } from "@/lib/utc-time";
import { BaseLanguageForm } from "./base-language-form";
import { SourceStatus } from "./source-status";

export type DetailState = { status: "loading" } | { status: "failed" | "rejected" } | { status: "ready"; detail: SourceDetail; refreshFailed?: boolean };
export function SourceDetailModal({ slug, sourceSlug, role, state, now, busy, importing = false, importResult, onBusy, onClose, onReload, onImport, onSaved, returnFocusRef, fallbackFocusRef }: {
  slug: string; sourceSlug: string | null; role: Role; state: DetailState; now: Date; busy: boolean;
  /** `busy`가 첫 Sync 때문인가 — 아니면 기준 언어 저장이다. 푸터가 무엇을 기다리는지 말한다 (audit #31). */
  importing?: boolean;
  importResult?: { text: string; tone: "success" | "warning" | "danger" };
  onBusy: (busy: boolean) => void; onClose: () => void; onReload: () => void; onImport: () => void; onSaved: () => void;
  returnFocusRef: RefObject<HTMLElement | null>; fallbackFocusRef: RefObject<HTMLElement | null>;
}) {
  const [fieldError, setFieldError] = useState(false);
  /**
   * ⚠️ **모달을 떠나는 길 전부가 같은 문을 지난다** (시안 `1j`) — 목록으로 돌아가는 넷(× · Esc ·
   * 배경 · [Close])과 번역으로 가는 둘(머리 보조 행동 · 언어 행 [Open])이 같은 확인창을 받는다.
   * 문마다 규칙이 다르면 어느 문으로 나갔는지에 따라 변경이 사라진다.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ href: string } | null>(null);
  const router = useRouter();
  const leave = (href?: string) => {
    if (busy) return;
    if (draft === null) { if (href) router.push(href); else onClose(); return; }
    setConfirm({ href: href ?? "" });
  };
  const detail = state.status === "ready" ? state.detail : null;
  const canEdit = canPerform(role, "project:settings");
  const actions = detail ? planSourceActions({ ...detail, role, archived: false, pending: busy }) : null;
  const importStatus = detail ? planSurfaceImportStatus(detail) : null;
  const canOpen = !!actions?.canOpen && detail !== null && detail.locales > 0;
  const disabledReason = !detail?.installed ? canEdit ? m.sources.reconnectOwner : m.sources.reconnectEditor : !detail?.lastCommitSha ? m.sources.firstImport : m.sources.noLanguages;
  const failed = state.status === "failed" || state.status === "rejected";
  const statusFailed = importStatus?.state.startsWith("failed") ?? false;
  /** 상태마다 "얼마나 됐나"의 출처가 다르다 — 없으면 시각을 생략하고 추정하지 않는다. */
  const statusAt = detail === null ? null
    : importStatus?.state === "importing" ? detail.lastImportStartedAt
    : importStatus?.state === "not-imported" ? detail.createdAt
    : statusFailed ? detail.lastImportFailedAt
    : detail.lastImportedAt;
  const statusLabel = importStatus === null ? "" : { "not-imported": m.settings.sources.notImported, importing: m.settings.sources.importing, "failed-first": m.settings.sources.failed, "failed-after": m.settings.sources.failedAfter, imported: m.settings.sources.imported }[importStatus.state];
  return <OnboardingModal open={sourceSlug !== null} title={sourceSlug ?? m.sources.details} description={detail ? `${m.surfaces.sourceCounts(detail.keys, detail.locales)}${detail.connection ? ` · ${detail.connection.format ?? (detail.connection.adapterName === null ? m.sources.notConfigured : m.sources.unknownFormat)}` : ""}` : failed ? undefined : m.sources.loading}
    onClose={() => leave()} closeDisabled={busy} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef} quiet={fieldError}
    panelClassName={cn(failed ? "min-h-0" : "min-h-[min(560px,calc(100svh-96px))] max-h-[min(800px,calc(100svh-96px))]")}
    headerAction={canOpen && sourceSlug && !busy
      ? <ButtonLink href={routes.surfaceTranslations(slug, sourceSlug, { ns: ALL_NAMESPACES })} onClick={event => { if (draft !== null) { event.preventDefault(); leave(routes.surfaceTranslations(slug, sourceSlug, { ns: ALL_NAMESPACES })); } }}>{m.sources.open}<ArrowRight className="text-muted-foreground size-3.5" aria-hidden /></ButtonLink>
      : detail ? <Button aria-disabled aria-describedby="source-open-reason" onClick={event => event.preventDefault()}>{m.sources.open}<ArrowRight className="text-muted-foreground size-3.5" aria-hidden /></Button> : undefined}
    actions={<Button size="lg" variant="primary" disabled={busy} onClick={() => leave()}>{m.common.close}</Button>} footer={<span id="source-open-reason" className="text-muted-foreground text-xs">{!canOpen && detail ? (busy ? importing ? m.settings.sources.importing : m.locales.field.saving : disabledReason) : m.sources.readOnlyNote}</span>}>
    {state.status === "loading" && <div className="space-y-6" aria-label={m.sources.loading}>
      {[1, 2, 3].map(n => <div key={n} className="space-y-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-5 w-64" /></div>)}
      <div className="space-y-3"><Skeleton className="h-4 w-32" />{[1, 2, 3].map(n => <div key={n} data-language-skeleton><Skeleton className="h-10 w-full" /></div>)}</div>
    </div>}
    {failed && <Alert variant="danger" actions={state.status === "failed" ? <Button onClick={onReload}>{m.sources.retry}</Button> : undefined}>{state.status === "failed" ? m.sources.unavailable : m.sources.rejected}</Alert>}
    {detail && <div className="@container space-y-4">
      {state.status === "ready" && state.refreshFailed && <Alert variant="warning" actions={<Button disabled={busy} onClick={onReload}>{m.sources.retry}</Button>}>{m.sources.latestFailed}</Alert>}
      {detail.connection && detail.repository && <section data-source-connection aria-label={m.sources.files} className="border-border bg-muted/40 overflow-hidden rounded-lg border">
        {/* ⚠️ 경로 셀이 형제 둘과 같은 14다 — 13이었던 것은 옛 `text-mono`(13/18)가 강제한 값이고, mono를 걷으면서 핸드오프의 14로 돌아왔다 (DESIGN §4.1·§6.66) */}
        <dl className="grid grid-cols-[minmax(0,1fr)_180px_280px] text-sm @max-[850px]:grid-cols-2">
          <div className="min-w-0 space-y-1 px-4 py-3.5 @max-[850px]:col-span-2"><dt className="text-muted-foreground text-xs">{m.sources.path}</dt><dd className="[overflow-wrap:anywhere]">{detail.connection.pathTemplate === null ? m.sources.notConfigured : slashBreaks(detail.connection.pathTemplate)}</dd></div>
          <div className="border-border space-y-1 border-l px-4 py-3.5 @max-[850px]:border-t @max-[850px]:border-l-0"><dt className="text-muted-foreground text-xs">{m.sources.format}</dt><dd>{detail.connection.format ?? (detail.connection.adapterName === null ? m.sources.notConfigured : m.sources.unknownFormat)}</dd></div>
          <div className="border-border min-w-0 space-y-1 border-l px-4 py-3.5 @max-[850px]:border-t"><dt className="text-muted-foreground text-xs">{m.sources.repository}</dt><dd className="[overflow-wrap:anywhere]">{detail.repository.repoOwner}/<wbr />{detail.repository.repoName} · {detail.repository.baseBranch}</dd></div>
        </dl>
      </section>}
      {/* ⚠️ **시안 `1d`의 행 형이다** — 28 칩 + 제목/보조 두 줄 + 오른쪽 행동. `Alert` 상자가 아니다:
          같은 카드 안에서 상태가 상자를 쓰면 실패만 다른 그릇이 된다. */}
      <PanelCard title={m.sources.status} subtitle={m.sources.statusHelp}>
        {importResult && <div role="status" className="border-divider text-base border-t px-4 py-[13px]">{importResult.text}</div>}
        <div className="border-divider flex items-center gap-3 border-t px-4 py-[13px]">
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded", statusFailed ? "bg-destructive/8 text-destructive" : "bg-foreground/5 text-neutral-600")}>
            {statusFailed ? <CircleAlert className="size-4" aria-hidden />
              : importStatus?.state === "importing" ? <span aria-hidden className="border-foreground/15 border-t-muted-foreground size-3.5 animate-spin rounded-full border-2 [animation-duration:0.7s]" />
              : importStatus?.state === "not-imported" ? <Clock className="size-4" aria-hidden />
              : <Check className="size-4" aria-hidden />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-base"><span className="font-medium">{statusLabel}</span>
              {statusAt !== null && <> — {importStatus?.state === "importing" && <>{m.sources.started} </>}{importStatus?.state === "not-imported" && <>{m.sources.addedAgo} </>}<RelativeAt at={statusAt} now={now} /></>}</span>
            <span className={cn("text-xs leading-[1.6]", statusFailed ? "text-destructive" : "text-muted-foreground")}>
              {isImportFailureCode(detail.lastImportError) ? importFailureMessage(detail.lastImportError)
                : detail.lastCommitSha ? m.sources.importedSummary(detail.keys, detail.locales)
                : m.sources.notImportedHelp}
              {statusFailed && !canEdit && <span className="text-muted-foreground"> {m.sources.askOwner}</span>}
              {importStatus?.state === "failed-after" && canEdit && <span className="text-muted-foreground"> {m.settings.sources.rerun}</span>}
            </span>
            {!detail.installed && <span className="text-muted-foreground text-xs">{canEdit ? <>{m.sources.reconnectOwner} <Link className="text-blue-600 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none" href={routes.settings(slug)}>{m.common.nav.projectSettings}</Link></> : m.sources.reconnectEditor}</span>}
          </span>
          {importStatus?.canRetry && canEdit && <Button className="shrink-0" loading={busy} disabled={!actions?.canRetry} onClick={onImport}>{m.settings.sources.retry}</Button>}
        </div>
        {/* ⚠️ **적재 이후 실패는 두 행이다** (`1d` ④) — 실패 한 줄만 두면 지금 보이는 키가 유효한지 알 수 없다.
            ⚠️ **둘째 행이 말하는 것은 적재 시각이 아니라 원본 커밋이다** — 적재 완료 시각을 저장하는 컬럼이 없다. */}
        {importStatus?.state === "failed-after" && detail.lastImportedAt && <div className="border-border flex items-center gap-3 border-t px-4 py-[13px]">
          <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded text-neutral-600"><Check className="size-4" aria-hidden /></span>
          <span className="min-w-0 flex-1 text-base"><span className="font-medium">{m.sources.lastSuccess}</span> — <SourceTime at={detail.lastImportedAt} /></span>
        </div>}
      </PanelCard>
      <PanelCard title={m.locales.field.label} subtitle={m.sources.baseHelp} badge={basePending(detail) ? <Badge variant="warning">{m.sources.waiting}</Badge> : undefined}>
        <div className="border-divider border-t px-4 py-[13px]">
        {canEdit ? <BaseLanguageForm key={detail.id} slug={slug} surfaceSlug={detail.slug} baseLocale={detail.baseLocale} declaredBaseLocale={detail.declaredBaseLocale} locales={detail.languages.filter(row => !row.orphaned).map(row => row.code)} awaiting={basePending(detail)} onDirty={setDraft} onPending={onBusy} onError={setFieldError} onSaved={onSaved} />
          : <div className="flex items-center gap-3">
              {/* 시안 `1e` ④ — EDITOR는 점선 칩과 자물쇠이고 컨트롤이 없다. */}
              <span className="border-border text-muted-foreground flex h-9 w-40 shrink-0 items-center gap-2 rounded-md border border-dashed px-2.5 text-sm"><Lock className="size-3.5" aria-hidden />{detail.baseLocale ?? m.sources.notConfigured}</span>
              <span className="text-muted-foreground min-w-0 flex-1 text-xs">{m.sources.editorBase}</span>
            </div>}
        {basePending(detail) && <div className="mt-3 space-y-2 text-xs">
          <p className="text-muted-foreground">{m.sources.applied}: <span className="text-foreground">{detail.baseLocale}</span> · {m.sources.requested}: <span className="text-foreground">{detail.declaredBaseLocale}</span></p>
          {/* ⚠️ `<code>`는 preflight가 mono를 깔아서 `font-sans`를 명시한다 — 클래스만 지우면 화면은 그대로 mono다 (DESIGN §4.1) */}
          {canEdit && <><p className="text-muted-foreground leading-[1.6]">{m.sources.pendingHelp}</p>{detail.workflowLine && <div className="flex items-center gap-3"><code className="font-sans">{detail.workflowLine}</code><CopyButton value={detail.workflowLine} label={m.locales.pending.copy} /></div>}</>}
        </div>}
        </div>
      </PanelCard>
      <PanelCard title={m.sources.languages} badge={<Badge variant="neutral">{detail.locales}</Badge>} subtitle={m.sources.languagesHelp}>
        {detail.languages.length === 0 ? <p className="text-muted-foreground border-divider border-t px-4 py-[13px] text-xs">{m.locales.empty.description}</p>
          : <ul>{detail.languages.map((row, index) => {
          // 집계 두 쿼리 사이 적재가 바뀌어도 막대 합은 트랙을 넘지 않는다. 퍼센트는 완료만 센다.
          const done = Math.min(row.total, row.translated);
          const review = Math.min(Math.max(0, row.total - done), row.needsReview);
          return <li key={row.code} className={cn("flex items-center gap-4 px-4 py-[13px] @max-[640px]:flex-wrap", index === 0 ? "border-divider border-t" : "border-border border-t")}>
            <span className="flex w-[150px] shrink-0 items-center gap-2 @max-[850px]:w-[120px]">
              <span className={cn("flex", row.orphaned && "opacity-50")}><LocaleFlag code={row.code} /></span>
              <span className={cn("text-base", row.orphaned && "text-muted-foreground")}>{row.code}</span>
              {row.isBase && <Badge variant="neutral">{m.locales.base}</Badge>}
            </span>
            <span className="flex w-[300px] shrink-0 flex-col gap-1.5 @max-[850px]:w-auto @max-[850px]:flex-1">
              <span className={cn("flex items-baseline text-xs", row.orphaned ? "text-neutral-400" : "text-muted-foreground")}>
                <span className={cn(!row.orphaned && "text-foreground")}>{row.percent}%</span><span className="ml-auto">{row.translated} of {row.total}</span>
              </span>
              <span aria-hidden className="bg-foreground/[0.08] flex h-1 overflow-hidden rounded-full">
                <span className={cn("h-1", row.orphaned ? "bg-foreground/25" : "bg-foreground/85")} style={{ width: `${row.total === 0 ? 0 : (done / row.total) * 100}%` }} />
                {!row.orphaned && <span className="h-1 bg-amber-500" style={{ width: `${row.total === 0 ? 0 : (review / row.total) * 100}%` }} />}
              </span>
            </span>
            {/* ⚠️ **좁은 폭에서 숨기지 않고 행 아래로 내린다** (audit #42) — 숨기면 `aria-hidden` Meter의 amber 조각만 남아 검토·누락이
                색으로만 전달됐다. 비어 있으면 줄을 만들지 않는다. */}
            <span className="min-w-0 flex-1 text-xs @max-[640px]:order-last @max-[640px]:basis-full @max-[640px]:empty:hidden">
              {row.orphaned ? <Badge variant="missing"><CircleAlert className="size-3.5" aria-hidden />{m.sources.missingRepo}</Badge>
                : row.needsReview > 0 ? <Badge variant="warning">{m.sources.needReview(row.needsReview)}</Badge>
                : row.isBase ? <span className="text-muted-foreground">{m.sources.baseRow}</span> : null}
            </span>
            {canOpen && !row.orphaned ? <ButtonLink size="sm" className="shrink-0" href={routes.surfaceTranslations(slug, detail.slug, { ns: ALL_NAMESPACES, language: row.code })} onClick={event => { if (draft !== null) { event.preventDefault(); leave(routes.surfaceTranslations(slug, detail.slug, { ns: ALL_NAMESPACES, language: row.code })); } }}>{m.sources.openLanguage}<ArrowRight className="text-muted-foreground size-3.5" aria-hidden /></ButtonLink>
              : busy ? <Button size="sm" className="shrink-0" disabled>{m.sources.openLanguage}</Button>
              : <><span id={`language-open-reason-${row.code}`} className="sr-only">{row.orphaned ? m.sources.orphanReason : disabledReason}</span><Button size="sm" className="shrink-0" aria-disabled aria-describedby={`language-open-reason-${row.code}`} onClick={event => event.preventDefault()}>{m.sources.openLanguage}</Button></>}
          </li>;
        })}</ul>}
        {/* ⚠️ **사라짐 안내는 행이 아니라 카드 바닥의 스트립이다** (시안 `1c`) — 행에 넣으면 비고 열이
            두 배로 길어져 같은 표에서 행 높이가 갈린다. 파일이 사라졌다고 단정하지 않는다. */}
        {detail.languages.filter(row => row.orphaned).map(row => <div key={`missing-${row.code}`} className="border-divider bg-foreground/2 text-destructive flex items-start gap-2 border-t px-4 pt-2.5 pb-3 text-xs">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="leading-[1.55] text-red-700"><span className="text-foreground">{row.code}</span> {m.sources.orphanStrip(row.code).slice(row.code.length + 1)} <span className="text-muted-foreground">{m.sources.orphanStripRest(row.translated, detail.locales)}</span></span>
        </div>)}
      </PanelCard>
    </div>}
    {confirm !== null && detail && <Dialog open onOpenChange={next => { if (!next) setConfirm(null); }}>
      <DialogContent title={m.sources.discardTitle} description={m.sources.discardBody(draft ?? "", detail.baseLocale ?? "")}
        footer={<>
          <DialogClose asChild><Button>{m.sources.keepEditing}</Button></DialogClose>
          <DialogClose asChild><Button variant="danger" onClick={() => { const href = confirm.href; setConfirm(null); setDraft(null); if (href) router.push(href); else onClose(); }}>{m.sources.discardChange}</Button></DialogClose>
        </>} />
    </Dialog>}
  </OnboardingModal>;
}
/**
 * ⚠️ **`/` 뒤에 줄바꿈 기회를 둔다** (malmoi#89). 경로·리포 값은 공백 없는 한 낱말이라 `overflow-wrap:anywhere`만으로는 칸 끝의
 * 아무 글자에서 꺾인다 — `break-all`이 `master`를 `m`/`aster`로 갈라 두 값처럼 읽혔던 그 모양이다. 조각 경계에서 먼저 꺾고,
 * 한 조각이 칸보다 길 때만 그 안에서 꺾는다. `<wbr>`는 복사한 텍스트에 아무것도 더하지 않는다.
 */
function slashBreaks(text: string) {
  return text.split("/").map((part, index) => <Fragment key={index}>{index > 0 && <>/<wbr /></>}{part}</Fragment>);
}
function SourceTime({ at }: { at: Date }) { return <time dateTime={at.toISOString()} aria-label={utcMinute(at)}>{utcMinute(at)}</time>; }
/** 상대 표기여도 절대 값을 함께 든다 — 화면의 낱말이 "5분 전"이어도 접근 이름은 UTC다 (DESIGN §6.68). */
function RelativeAt({ at, now }: { at: Date; now: Date }) { return <time dateTime={at.toISOString()} aria-label={utcMinute(at)}>{relativeTime(at, now)}</time>; }
