"use client";
import Link from "next/link";
import { Fragment, useState, type RefObject } from "react";
import { OnboardingModal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { PanelCard } from "@/components/ui/panel-card";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { LocaleMeter } from "@/components/locale-meter";
import { LocaleFlag } from "@/components/translations/locale-badge";
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
export function SourceDetailModal({ slug, sourceSlug, role, state, now, busy, importResult, onBusy, onClose, onReload, onImport, onSaved, returnFocusRef, fallbackFocusRef }: {
  slug: string; sourceSlug: string | null; role: Role; state: DetailState; now: Date; busy: boolean;
  importResult?: { text: string; tone: "success" | "warning" | "danger" };
  onBusy: (busy: boolean) => void; onClose: () => void; onReload: () => void; onImport: () => void; onSaved: () => void;
  returnFocusRef: RefObject<HTMLElement | null>; fallbackFocusRef: RefObject<HTMLElement | null>;
}) {
  const [fieldError, setFieldError] = useState(false);
  const detail = state.status === "ready" ? state.detail : null;
  const canEdit = canPerform(role, "project:settings");
  const actions = detail ? planSourceActions({ ...detail, role, archived: false, pending: busy }) : null;
  const importStatus = detail ? planSurfaceImportStatus(detail) : null;
  const canOpen = !!actions?.canOpen && detail !== null && detail.locales > 0;
  const disabledReason = !detail?.installed ? canEdit ? m.sources.reconnectOwner : m.sources.reconnectEditor : !detail?.lastCommitSha ? m.sources.firstImport : m.sources.noLanguages;
  const failed = state.status === "failed" || state.status === "rejected";
  return <OnboardingModal open={sourceSlug !== null} title={sourceSlug ?? m.sources.details} description={detail ? `${m.surfaces.sourceCounts(detail.keys, detail.locales)}${detail.connection ? ` · ${detail.connection.format ?? (detail.connection.adapterName === null ? m.sources.notConfigured : m.sources.unknownFormat)}` : ""}` : failed ? undefined : m.sources.loading}
    onClose={onClose} closeDisabled={busy} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef} quiet={fieldError}
    panelClassName={cn(failed ? "min-h-0" : "min-h-[min(560px,calc(100svh-96px))] max-h-[min(800px,calc(100svh-96px))]")}
    actions={<div className="flex items-center gap-2">
      {canOpen && sourceSlug ? <ButtonLink size="lg" href={routes.surfaceTranslations(slug, sourceSlug, { ns: ALL_NAMESPACES })}>{m.sources.open}</ButtonLink> : <Button size="lg" disabled aria-describedby="source-open-reason">{m.sources.open}</Button>}
      <Button size="lg" disabled={busy} onClick={onClose}>{m.common.close}</Button>
    </div>} footer={!canOpen && detail ? <span id="source-open-reason" className="text-muted-foreground text-xs">{busy ? m.locales.field.saving : disabledReason}</span> : undefined}>
    {state.status === "loading" && <div className="space-y-6" aria-label={m.sources.loading}>
      {[1, 2, 3].map(n => <div key={n} className="space-y-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-5 w-64" /></div>)}
      <div className="space-y-3"><Skeleton className="h-4 w-32" />{[1, 2, 3].map(n => <div key={n} data-language-skeleton><Skeleton className="h-10 w-full" /></div>)}</div>
    </div>}
    {failed && <Alert variant="danger" actions={state.status === "failed" ? <Button onClick={onReload}>{m.sources.retry}</Button> : undefined}>{state.status === "failed" ? m.sources.unavailable : m.sources.rejected}</Alert>}
    {detail && <div className="@container space-y-4">
      {state.status === "ready" && state.refreshFailed && <Alert variant="warning" actions={<Button disabled={busy} onClick={onReload}>{m.sources.retry}</Button>}>{m.sources.latestFailed}</Alert>}
      {detail.connection && detail.repository && <section data-source-connection aria-label={m.sources.files} className="border-border bg-muted/40 overflow-hidden rounded-lg border">
        <dl className="grid grid-cols-[minmax(0,1fr)_180px_280px] text-sm @max-[850px]:grid-cols-2">
          <div className="min-w-0 space-y-1 px-4 py-3.5 @max-[850px]:col-span-2"><dt className="text-muted-foreground text-xs">{m.sources.path}</dt><dd className="text-mono break-all">{detail.connection.pathTemplate ?? m.sources.notConfigured}</dd></div>
          <div className="border-border space-y-1 border-l px-4 py-3.5 @max-[850px]:border-t @max-[850px]:border-l-0"><dt className="text-muted-foreground text-xs">{m.sources.format}</dt><dd>{detail.connection.format ?? (detail.connection.adapterName === null ? m.sources.notConfigured : m.sources.unknownFormat)}</dd></div>
          <div className="border-border min-w-0 space-y-1 border-l px-4 py-3.5 @max-[850px]:border-t"><dt className="text-muted-foreground text-xs">{m.sources.repository}</dt><dd className="break-all">{detail.repository.repoOwner}/{detail.repository.repoName} · {detail.repository.baseBranch}</dd></div>
        </dl>
      </section>}
      <PanelCard title={m.sources.status}>
        <div className="space-y-3 px-4 py-[13px]">
        {importResult && <Alert variant={importResult.tone} role="status">{importResult.text}</Alert>}
        <Alert role="status" variant={importStatus?.state.startsWith("failed") ? "warning" : importStatus?.state === "imported" ? "success" : "info"} className={cn(!importStatus?.state.startsWith("failed") && "rounded-none border-0 p-0")}>
          <div className="space-y-2">
            <SourceStatus source={detail} now={now} />
            <p>{isImportFailureCode(detail.lastImportError) ? importFailureMessage(detail.lastImportError) : detail.lastCommitSha ? m.sources.importedHelp : m.sources.firstImport}</p>
            {importStatus?.state === "failed-after" && canEdit && <p>{m.settings.sources.rerun}</p>}
            {!detail.installed && <p>{canEdit ? <>{m.sources.reconnectOwner} <Link className="text-link" href={routes.settings(slug)}>{m.common.nav.projectSettings}</Link></> : m.sources.reconnectEditor}</p>}
            {importStatus?.state.startsWith("failed") && detail.lastImportFailedAt && <p>{m.sources.failedAt} — <SourceTime at={detail.lastImportFailedAt} /></p>}
            {detail.lastCommitSha && <p>{importStatus?.state === "failed-after" ? m.sources.lastCommit : m.sources.sourceCommit}{detail.lastCommitAt && <> — <SourceTime at={detail.lastCommitAt} /></>} · <span className="text-mono">{detail.lastCommitSha.slice(0, 7)}</span></p>}
            {importStatus?.canRetry && (canEdit ? <Button loading={busy} disabled={!actions?.canRetry} onClick={onImport}>{m.settings.sources.retry}</Button> : <p>{m.sources.askOwner}</p>)}
          </div>
        </Alert>
        </div>
      </PanelCard>
      <PanelCard title={m.locales.field.label}>
        <div className="space-y-3 px-4 py-[13px]">
        {canEdit ? <BaseLanguageForm key={detail.id} slug={slug} surfaceSlug={detail.slug} baseLocale={detail.baseLocale} declaredBaseLocale={detail.declaredBaseLocale} locales={detail.languages.filter(row => !row.orphaned).map(row => row.code)} onPending={onBusy} onError={setFieldError} onSaved={onSaved} /> : <p className="text-sm">{m.sources.applied}: {detail.baseLocale ?? m.sources.notConfigured}</p>}
        {basePending(detail) && <Alert variant="info" title={m.sources.waiting}>
          <p>{m.sources.applied}: {detail.baseLocale} · {m.sources.requested}: {detail.declaredBaseLocale}</p>
          {canEdit && <><p className="mt-2">{m.sources.pendingHelp}</p>{detail.workflowLine && <div className="mt-3 flex items-center gap-3"><code className="text-mono">{detail.workflowLine}</code><CopyButton value={detail.workflowLine} label={m.locales.pending.copy} /></div>}</>}
        </Alert>}
        </div>
      </PanelCard>
      <PanelCard title={m.sources.languages} badge={<Badge variant="neutral">{detail.locales}</Badge>}>
        <div className="px-4">
        {detail.languages.length === 0 ? <p className="text-muted-foreground text-sm">{m.locales.empty.description}</p> : <table className="w-full table-fixed text-left text-xs">
          <thead><tr className="border-border border-b text-muted-foreground"><th className="w-32 py-3 font-normal">{m.locales.columns.code}</th><th className="w-24 font-normal">{m.locales.columns.progress}</th><th className="w-28 font-normal">{m.sources.progress}</th><th className="w-24 font-normal">{m.sources.review}</th><th className="font-normal @max-[640px]:hidden">{m.sources.status}</th><th className="w-16"><span className="sr-only">{m.sources.openLanguage}</span></th></tr></thead>
          <tbody>{detail.languages.map(row => {
            // 집계 두 쿼리 사이 적재가 바뀌어도 막대 합은 트랙을 넘지 않는다. 퍼센트는 완료만 센다.
            const done = Math.min(row.total, row.translated);
            const review = Math.min(Math.max(0, row.total - done), row.needsReview);
            const reason = <><p><Badge variant="danger">{m.sources.missingBadge}</Badge></p><p>{m.sources.orphanReason}</p><p>{m.sources.orphanRestore}</p></>;
            return <Fragment key={row.code}><tr className="border-border border-b">
              <td className="py-4"><span className="flex items-center gap-1.5"><LocaleFlag code={row.code} /><span>{row.code}</span>{row.isBase && <Badge variant="neutral">{m.locales.base}</Badge>}</span></td>
              <td>{row.translated}/{row.total}</td><td><LocaleMeter locale={{ surfaceSlug: detail.slug, code: "", isBase: row.isBase, total: row.total, done, review, percent: row.percent }} /></td>
              <td>{row.needsReview}</td><td className="pr-3 leading-[1.6] @max-[640px]:hidden">{row.orphaned && reason}</td>
              <td>{canOpen && !row.orphaned ? <ButtonLink size="sm" href={routes.surfaceTranslations(slug, detail.slug, { ns: ALL_NAMESPACES, locales: row.code })}>{m.sources.openLanguage}</ButtonLink> : <Button size="sm" disabled title={row.orphaned ? m.sources.orphanReason : busy ? m.locales.field.saving : disabledReason}>{m.sources.openLanguage}</Button>}</td>
            </tr>{row.orphaned && <tr className="hidden @max-[640px]:table-row"><td colSpan={6} className="text-muted-foreground pb-4 leading-[1.6]">{reason}</td></tr>}</Fragment>;
          })}</tbody>
        </table>}
        </div>
      </PanelCard>
    </div>}
  </OnboardingModal>;
}
function SourceTime({ at }: { at: Date }) { return <time dateTime={at.toISOString()} aria-label={utcMinute(at)}>{utcMinute(at)}</time>; }
