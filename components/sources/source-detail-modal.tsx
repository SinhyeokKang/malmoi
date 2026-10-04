"use client";
import { Link as InlineLink } from "@/components/ui/link";
import { Meter } from "@/components/ui/meter";
import { ListRow } from "@/components/ui/list-row";
import { Fact } from "@/components/ui/facts";

import { ChevronRight, CircleCheck, CircleX, Info, LoaderCircle, Lock, TriangleAlert } from "lucide-react";
import { Fragment, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { LargeModal } from "@/components/ui/large-modal";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { LocaleFlag } from "@/components/translations/locale-badge";

import { relativeTime } from "@/lib/relative-time";
import { CopyButton } from "@/components/ui/copy-button";
import { canPerform, type Role } from "@/lib/auth/permission";
import { useDateStyle, useMessages } from "@/components/i18n/messages-provider";
import { planSurfaceImportStatus, type SurfaceImportStatus } from "@/lib/import/surface-status";
import { basePending } from "@/lib/onboarding/base-pending";
import { importFailureMessage, isImportFailureCode } from "@/lib/projects/import-failure";
import { routes, ALL_NAMESPACES } from "@/lib/routes";
import { planSourceActions } from "@/lib/sources/actions";
import { STATE, stateLabel } from "@/lib/status/canon";
import type { SourceDetail } from "@/lib/sources/query";
import { formatMinute } from "@/lib/date-format";
import { BaseLanguageForm } from "./base-language-form";
import { IconTile } from "@/components/ui/icon-tile";

export type DetailState = { status: "loading" } | { status: "failed" | "rejected" } | { status: "ready"; detail: SourceDetail; refreshFailed?: boolean };
export function SourceDetailModal({ slug, sourceSlug, role, state, now, busy, importing = false, importResult, onBusy, onClose, onReload, onImport, onSaved, returnFocusRef, fallbackFocusRef }: {
  slug: string; sourceSlug: string | null; role: Role; state: DetailState; now: Date; busy: boolean;
  /** `busy`가 첫 Sync 때문인가 — 아니면 기준 언어 저장이다. 푸터가 무엇을 기다리는지 말한다 (audit #31). */
  importing?: boolean;
  importResult?: { text: string; tone: "success" | "warning" | "danger" };
  onBusy: (busy: boolean) => void; onClose: () => void; onReload: () => void; onImport: () => void; onSaved: () => void;
  returnFocusRef: RefObject<HTMLElement | null>; fallbackFocusRef: RefObject<HTMLElement | null>;
}) {
  const m = useMessages();
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
  const statusFailed = importStatus?.state === "failed-first" || importStatus?.state === "failed-after";
  /*
    상태의 시각은 판정이 든다(`planSurfaceImportStatus().at` — 6-⚪13, 목록과 같은 값). 미적재만 판정에 시각이 없고,
    여기서는 "언제 더했나"(`createdAt`)를 따로 말한다 — 없으면 시각을 생략하고 추정하지 않는다.
  */
  const statusAt = detail === null || importStatus === null ? null : importStatus.state === "not-imported" ? detail.createdAt : importStatus.at;
  return <LargeModal open={sourceSlug !== null} title={sourceSlug ?? m.sources.details} description={detail ? `${m.surfaces.sourceCounts(detail.keys, detail.locales)}${detail.connection ? ` · ${detail.connection.format ?? (detail.connection.adapterName === null ? m.sources.notConfigured : m.sources.unknownFormat)}` : ""}` : failed ? undefined : m.sources.loading}
    onClose={() => leave()} closeDisabled={busy} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef} quiet={fieldError}
    className={cn(failed ? "min-h-0" : "min-h-[min(560px,calc(100svh-var(--spacing-modal-gutter)))] max-h-[min(800px,calc(100svh-var(--spacing-modal-gutter)))]")}
    // [Open translations]는 바닥 행동 줄의 primary다(2026-09-30 사용자 — 머리 우측에서 옮겼다). [Close]가 보조다. 목록 행의 같은 버튼은 걷혔고 이 모달이 유일한 입구다.
    actions={<>
      <Button size="lg" disabled={busy} onClick={() => leave()}>{m.common.close}</Button>
      {canOpen && sourceSlug && !busy
        ? <ButtonLink size="lg" variant="primary" href={routes.surfaceTranslations(slug, sourceSlug, { ns: ALL_NAMESPACES })} onClick={event => { if (draft !== null) { event.preventDefault(); leave(routes.surfaceTranslations(slug, sourceSlug, { ns: ALL_NAMESPACES })); } }}>{m.sources.open}</ButtonLink>
        : detail ? <Button size="lg" variant="primary" aria-disabled aria-describedby="source-open-reason" onClick={event => event.preventDefault()}>{m.sources.open}</Button> : null}
    </>} notice={<span id="source-open-reason" className="text-muted-foreground text-xs">{!canOpen && detail ? (busy ? importing ? m.settings.sources.importing : m.locales.field.saving : disabledReason) : m.sources.readOnlyNote}</span>}>
    {/* 골격은 장식이다 — 불러오는 중은 대화상자 설명(`description`)이 말한다. 역할 없는 div의 `aria-label`은 읽히지 않는다 (audit #89). */}
    {state.status === "loading" && <div className="space-y-6" data-source-loading aria-hidden>
      {[1, 2, 3].map(n => <div key={n} className="space-y-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-5 w-64" /></div>)}
      <div className="space-y-3"><Skeleton className="h-4 w-32" />{[1, 2, 3].map(n => <div key={n} data-language-skeleton><Skeleton className="h-10 w-full" /></div>)}</div>
    </div>}
    {failed && <Alert variant="danger" actions={state.status === "failed" ? <Button onClick={onReload}>{m.sources.retry}</Button> : undefined}>{state.status === "failed" ? m.sources.unavailable : m.sources.rejected}</Alert>}
    {detail && <div className="@container space-y-4">
      {state.status === "ready" && state.refreshFailed && <Alert variant="warning" actions={<Button disabled={busy} onClick={onReload}>{m.sources.retry}</Button>}>{m.sources.latestFailed}</Alert>}
      {detail.connection && detail.repository && <section data-source-connection aria-label={m.sources.files} className="border-border bg-muted/40 overflow-hidden rounded-lg border">
        {/* ⚠️ 경로 셀이 형제 둘과 같은 14다 — 13이었던 것은 옛 `text-mono`(13/18)가 강제한 값이고, mono를 걷으면서 핸드오프의 14로 돌아왔다 (DESIGN §4.1·§6.66) */}
        <dl className="grid grid-cols-[minmax(0,1fr)_180px_280px] text-sm @max-[850px]:grid-cols-2">
          <Fact layout="stacked" className="min-w-0 px-4 py-3.5 @max-[850px]:col-span-2" label={m.sources.path}><span className="wrap-anywhere">{detail.connection.pathTemplate === null ? m.sources.notConfigured : slashBreaks(detail.connection.pathTemplate)}</span></Fact>
          <Fact layout="stacked" className="border-border border-l px-4 py-3.5 @max-[850px]:border-t @max-[850px]:border-l-0" label={m.sources.format}>{detail.connection.format ?? (detail.connection.adapterName === null ? m.sources.notConfigured : m.sources.unknownFormat)}</Fact>
          <Fact layout="stacked" className="border-border min-w-0 border-l px-4 py-3.5 @max-[850px]:border-t" label={m.sources.repository}><span className="wrap-anywhere">{detail.repository.repoOwner}/<wbr />{detail.repository.repoName} · {detail.repository.baseBranch}</span></Fact>
        </dl>
      </section>}
      {/* ⚠️ **상태 줄은 시안 `1d`의 행 형이다** — 28 칩 + 제목/보조 두 줄 + 오른쪽 행동. 상태 줄은 `Alert` 상자가 아니다(결과 notice만 Alert다):
          같은 카드 안에서 상태가 상자를 쓰면 실패만 다른 그릇이 된다. */}
      {/* 적재 결과는 카드 notice다(🔴 J) — 계산한 톤을 `Alert inset`이 그리고, 실패는 `alert`로 읽던 것을 끊는다. 머리 아래 선은 notice 아래로 내려간다(4-Y1). */}
      <Card title={m.sources.status} description={m.sources.statusHelp}
        notice={importResult ? <Alert inset variant={importResult.tone} live={importResult.tone === "danger" ? "alert" : "status"}>{importResult.text}</Alert> : undefined}>
        <ListRow>
          {importStatus && <IconTile data-source-status-tile tone={importStatus.tone}><StatusGlyph labelKey={importStatus.labelKey} /></IconTile>}
          <span className="flex min-w-0 flex-1 flex-col gap-copy-gap">
            <span className="text-base"><span className="font-medium">{importStatus && stateLabel(m, importStatus.labelKey)}</span>
              {statusAt !== null && <> — {importStatus?.state === "importing" && <>{m.sources.started} </>}{importStatus?.state === "not-imported" && <>{m.sources.addedAgo} </>}<RelativeAt at={statusAt} now={now} /></>}</span>
            {/* 보조 문장은 본문 색이다 — 톤은 칸과 낱말이 든다(§6.2 "Alert는 글자를 본문 색으로"와 같은 규칙, 옛 판은 호출부가 호박·빨강 글자를 골랐다). */}
            <span className="text-muted-foreground text-xs leading-body">
              {isImportFailureCode(detail.lastImportError) ? importFailureMessage(m, detail.lastImportError)
                : detail.lastCommitSha ? m.sources.importedSummary(detail.keys, detail.locales)
                : m.sources.notImportedHelp}
              {statusFailed && !canEdit && <> {importStatus?.state === "failed-after" ? m.sources.askOwnerRerun : m.sources.askOwner}</>}
              {importStatus?.state === "failed-after" && canEdit && <> {m.settings.sources.rerun}</>}
            </span>
            {!detail.installed && <span className="text-muted-foreground text-xs">{canEdit ? <>{m.sources.reconnectOwner} <InlineLink href={routes.settings(slug)}>{m.common.nav.projectSettings}</InlineLink></> : m.sources.reconnectEditor}</span>}
          </span>
          {/* ⚠️ 스피너는 첫 Sync일 때만 돈다 (audit-ux #26) — 기준 언어 저장도 `busy`를 세우고, 그때는 `canRetry`가 꺼서 잠그기만 한다. */}
          {importStatus?.canRetry && canEdit && <Button className="shrink-0" loading={importing} disabled={!actions?.canRetry} onClick={onImport}>{m.settings.sources.retry}</Button>}
        </ListRow>
        {/* ⚠️ **적재 이후 실패는 두 행이다** (`1d` ④) — 실패 한 줄만 두면 지금 보이는 키가 유효한지 알 수 없다.
            ⚠️ **둘째 행이 말하는 것은 적재 시각이 아니라 원본 커밋이다** — 적재 완료 시각을 저장하는 컬럼이 없다. */}
        {importStatus?.state === "failed-after" && detail.lastImportedAt && <ListRow className="border-border border-t">
          <IconTile tone={STATE.synced.tone}><CircleCheck aria-hidden /></IconTile>
          <span className="min-w-0 flex-1 text-base"><span className="font-medium">{m.sources.lastSuccess}</span> — <SourceTime at={detail.lastImportedAt} /></span>
        </ListRow>}
      </Card>
      <Card title={m.locales.field.label} description={m.sources.baseHelp} badge={basePending(detail) ? <StatusBadge state="waitingToApply" /> : undefined}>
        <div className="px-4 py-row-y">
        {canEdit ? <BaseLanguageForm key={detail.id} slug={slug} surfaceSlug={detail.slug} baseLocale={detail.baseLocale} declaredBaseLocale={detail.declaredBaseLocale} locales={detail.languages.filter(row => !row.orphaned).map(row => row.code)} awaiting={basePending(detail)} onDirty={setDraft} onPending={onBusy} onError={setFieldError} onSaved={onSaved} />
          : <div className="flex items-center gap-3">
              {/* 시안 `1e` ④ — EDITOR는 점선 칩과 자물쇠이고 컨트롤이 없다. */}
              <span className="border-border text-muted-foreground flex h-9 w-40 shrink-0 items-center gap-2 rounded-md border border-dashed px-2.5 text-sm"><Lock className="size-3.5" aria-hidden />{detail.baseLocale ?? m.sources.notConfigured}</span>
              <span className="text-muted-foreground min-w-0 flex-1 text-xs">{m.sources.editorBase}</span>
            </div>}
        {basePending(detail) && <div className="mt-3 space-y-2 text-xs">
          <p className="text-muted-foreground">{m.sources.applied}: <span className="text-foreground">{detail.baseLocale}</span> · {m.sources.requested}: <span className="text-foreground">{detail.declaredBaseLocale}</span></p>
          {/* ⚠️ `<code>`는 preflight가 mono를 깔아서 `font-sans`를 명시한다 — 클래스만 지우면 화면은 그대로 mono다 (DESIGN §4.1) */}
          {canEdit && <><p className="text-muted-foreground leading-body">{m.sources.pendingHelp}</p>{detail.workflowLine && <div className="flex items-center gap-3"><code className="font-sans">{detail.workflowLine}</code><CopyButton value={detail.workflowLine} label={m.locales.pending.copy} /></div>}</>}
        </div>}
        </div>
      </Card>
      <Card title={m.sources.languages} count={detail.locales} countLabel={m.sources.languageCount(detail.locales)} description={m.sources.languagesHelp}>
        {detail.languages.length === 0 ? <p className="text-muted-foreground px-4 py-row-y text-xs">{m.locales.empty.description}</p>
          : <ul>{detail.languages.map((row, index) => {
          // 집계 두 쿼리 사이 적재가 바뀌어도 막대 합은 트랙을 넘지 않는다. 퍼센트는 완료만 센다.
          const done = Math.min(row.total, row.translated);
          const review = Math.min(Math.max(0, row.total - done), row.needsReview);
          return <li key={row.code} className={cn("flex items-center gap-4 px-4 py-row-y @max-form:flex-wrap", index > 0 && "border-border border-t")}>
            <span className="flex w-[150px] shrink-0 items-center gap-2 @max-[850px]:w-[120px]">
              <span className={cn("flex", row.orphaned && "opacity-50")}><LocaleFlag code={row.code} /></span>
              <span className={cn("text-base", row.orphaned && "text-muted-foreground")}>{row.code}</span>
              {row.isBase && <Badge variant="soft-neutral">{m.locales.base}</Badge>}
            </span>
            <span className="flex w-[300px] shrink-0 flex-col gap-1.5 @max-[850px]:w-auto @max-[850px]:flex-1">
              <span className={cn("flex items-baseline text-xs", row.orphaned ? "text-gray-dim" : "text-muted-foreground")}>
                <span className={cn(!row.orphaned && "text-foreground")}>{row.percent}%</span><span className="ml-auto">{m.sources.translatedOfTotal(row.translated, row.total)}</span>
              </span>
              <Meter done={row.total === 0 ? 0 : (done / row.total) * 100} review={row.orphaned || row.total === 0 ? 0 : (review / row.total) * 100} dimmed={row.orphaned} />
            </span>
            {/* ⚠️ **좁은 폭에서 숨기지 않고 행 아래로 내린다** (audit #42) — 숨기면 `aria-hidden` Meter의 amber 조각만 남아 검토·누락이
                색으로만 전달됐다. 비어 있으면 줄을 만들지 않는다. */}
            <span className="min-w-0 flex-1 text-xs @max-form:order-last @max-form:basis-full @max-form:empty:hidden">
              {row.orphaned ? <StatusBadge state="removedFromRepository" />
                : row.needsReview > 0 ? <Badge variant="soft-amber">{m.sources.needReview(row.needsReview)}</Badge>
                : row.isBase ? <span className="text-muted-foreground">{m.sources.baseRow}</span> : null}
            </span>
            {canOpen && !row.orphaned ? <ButtonLink size="sm" className="shrink-0" href={routes.surfaceTranslations(slug, detail.slug, { ns: ALL_NAMESPACES, language: row.code })} onClick={event => { if (draft !== null) { event.preventDefault(); leave(routes.surfaceTranslations(slug, detail.slug, { ns: ALL_NAMESPACES, language: row.code })); } }}>{m.sources.openLanguage}<ChevronRight className="text-muted-foreground size-3.5" aria-hidden /></ButtonLink>
              : busy ? <Button size="sm" className="shrink-0" disabled>{m.sources.openLanguage}</Button>
              : <><span id={`language-open-reason-${row.code}`} className="sr-only">{row.orphaned ? m.sources.orphanReason : disabledReason}</span><Button size="sm" className="shrink-0" aria-disabled aria-describedby={`language-open-reason-${row.code}`} onClick={event => event.preventDefault()}>{m.sources.openLanguage}</Button></>}
          </li>;
        })}</ul>}
        {/* ⚠️ **사라짐 안내는 행이 아니라 카드 바닥의 스트립이다** (시안 `1c`) — 행에 넣으면 비고 열이
            두 배로 길어져 같은 표에서 행 높이가 갈린다. 파일이 사라졌다고 단정하지 않는다.
            ⚠️ **`BannerLine`이 아니라 `Alert inset danger`다**(5-Y10) — `BannerLine`은 한 줄로 자르는데 이 안내는 세 문장이다(복구 길까지).
            지난 상태라 `live="off"`다 — 모달을 여는 순간 assertive로 끼어들지 않는다. */}
        {detail.languages.filter(row => row.orphaned).map(row => <div key={`missing-${row.code}`} className="border-divider border-t">
          <Alert inset size="sm" variant="danger" live="off">
            <span className="leading-translation"><span className="font-medium">{row.code}</span> {m.sources.orphanStrip(row.code).slice(row.code.length + 1)} <span className="text-muted-foreground">{m.sources.orphanStripRest(row.translated, detail.locales)}</span></span>
          </Alert>
        </div>)}
      </Card>
    </div>}
    {confirm !== null && detail && <Dialog open onOpenChange={next => { if (!next) setConfirm(null); }}>
      <DialogContent title={m.sources.discardTitle} description={m.sources.discardBody(draft ?? "", detail.baseLocale ?? "")}
        actions={<>
          <DialogClose asChild><Button data-initial-focus>{m.sources.keepEditing}</Button></DialogClose>
          <DialogClose asChild><Button variant="danger" onClick={() => { const href = confirm.href; setConfirm(null); setDraft(null); if (href) router.push(href); else onClose(); }}>{m.sources.discardChange}</Button></DialogClose>
        </>} />
    </Dialog>}
  </LargeModal>;
}
/**
 * ⚠️ **`/` 뒤에 줄바꿈 기회를 둔다** (malmoi#89). 경로·리포 값은 공백 없는 한 낱말이라 `overflow-wrap:anywhere`만으로는 칸 끝의
 * 아무 글자에서 꺾인다 — `break-all`이 `master`를 `m`/`aster`로 갈라 두 값처럼 읽혔던 그 모양이다. 조각 경계에서 먼저 꺾고,
 * 한 조각이 칸보다 길 때만 그 안에서 꺾는다. `<wbr>`는 복사한 텍스트에 아무것도 더하지 않는다.
 */
function slashBreaks(text: string) {
  return text.split("/").map((part, index) => <Fragment key={index}>{index > 0 && <>/<wbr /></>}{part}</Fragment>);
}
function SourceTime({ at }: { at: Date }) {
  const style = useDateStyle(); return <time dateTime={at.toISOString()} aria-label={formatMinute(at, style)}>{formatMinute(at, style)}</time>; }
/**
 * 상세 칸의 글리프 — §2.4 글리프 열이다(5-Y4): 실패 `CircleX` · 경고 `TriangleAlert` · 성공 `CircleCheck` · 그 밖 `Info`.
 * 진행 중은 `LoaderCircle` 회전이다(5-Y14 — 옛 손 조립 원 스피너. 칸 안 자리 교체라 `Button loading`으로 못 옮긴다).
 */
function StatusGlyph({ labelKey }: { labelKey: SurfaceImportStatus["labelKey"] }) {
  switch (labelKey) {
    case "syncFailed": return <CircleX aria-hidden />;
    case "partiallySynced": return <TriangleAlert aria-hidden />;
    case "synced": return <CircleCheck aria-hidden />;
    case "syncing": return <LoaderCircle className="animate-spin" aria-hidden />;
    case "notSyncedYet": return <Info aria-hidden />;
  }
}
/** 상대 표기여도 절대 값을 함께 든다 — 화면의 낱말이 "5분 전"이어도 접근 이름은 절대 시각이다 (DESIGN §6.68). */
function RelativeAt({ at, now }: { at: Date; now: Date }) {
  const style = useDateStyle(); return <time dateTime={at.toISOString()} aria-label={formatMinute(at, style)}>{relativeTime(at, now, style.uiLocale)}</time>; }
