"use client";
import { ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";

import { cancelSourceLocaleRemoval } from "@/app/(edit)/projects/[slug]/sources/actions";
import { useMessages } from "@/components/i18n/messages-provider";
import { LocaleFlag } from "@/components/translations/locale-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link as InlineLink } from "@/components/ui/link";
import { Meter } from "@/components/ui/meter";
import { StatusBadge } from "@/components/ui/status-badge";
import { canPerform, type Role } from "@/lib/auth/permission";
import { supportsLocaleChanges } from "@/lib/locales/add-plan";
import { reviewNumberFrom } from "@/lib/projects/review-number";
import { ALL_NAMESPACES, routes } from "@/lib/routes";
import type { SourceDetail } from "@/lib/sources/query";
import { cn } from "@/lib/utils";
import { AddLocaleDialog, type AddOutcome } from "./add-locale-dialog";
import { listedLanguageCount, planLanguageRow, type LanguageRowPlan } from "./language-row";
import { RemoveLocaleDialog, type RemoveOutcome } from "./remove-locale-dialog";

type Notice = { tone: "success" | "warning" | "danger"; text: string };
type Focus = { pick: (card: HTMLElement) => HTMLElement | null; detail: SourceDetail };

/**
 * **Sources 상세의 Languages 카드** (locale-add E1 — 시안 L1–L7). 머리 [Add language] · 행마다 상태 배지 + 동작 하나 + [Open] · Inactive 띠 ·
 * 결과 notice가 이 카드에 있다. 판정은 `planLanguageRow`, 실행은 Dialog 둘(추가 · 제거/추가 취소)과 [Cancel removal](확인 없음)이다.
 *
 * ⚠️ **꺼진 동작은 숨기지 않는다**(D7) — EDITOR·비지원 포맷도 같은 자리에 `aria-disabled`로 서고, 사유는 카드 설명 한 번 + 컨트롤의 sr 설명이다.
 * ⚠️ **포커스 규칙 하나**(design-brief): 행이 제자리에 남으면 그 행의 다음 동작, 정렬로 옮겨 가면(Inactive로 끝에 감) 머리 [Add language], 추가 성공은
 * 새 행 [Open]. 대상은 결과를 다시 읽은 뒤에야 서므로 기다렸다가 옮긴다 — 다시 읽은 뒤에도 없으면 머리로 간다.
 * ⚠️ **결과는 카드 notice다**(A5·L7) — Status 카드의 적재 결과와 같은 자리·형이다. 닫는 것은 사람이다.
 */
export function LanguagesCard({ slug, detail, role, busy, canOpen, openReason, onNavigate, onReload, focusLanguage = null }: {
  slug: string; detail: SourceDetail; role: Role; busy: boolean;
  /** 소스가 번역 화면을 열 수 있나(연결·첫 적재·언어 있음) — 행 [Open]의 바탕이다. */
  canOpen: boolean;
  /** 위가 거짓일 때의 sr 사유. */
  openReason: string;
  /** 행 [Open] — 상세 모달의 미저장 확인을 지난다. */
  onNavigate: (href: string, event: MouseEvent) => void;
  onReload: () => void;
  /** 딥링크(`?language=`)의 언어 — 카드가 서면 그 행의 동작에 포커스한다. 없는 언어면 아무것도 하지 않는다. */
  focusLanguage?: string | null;
}) {
  const m = useMessages();
  const t = m.sources.locale;
  const helpId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const canManage = canPerform(role, "project:settings");
  const supported = canManage && detail.connection !== undefined && supportsLocaleChanges(detail.connection.adapterName);
  const unconfirmed = detail.localeDelivery === "unconfirmed";
  const pr = reviewNumberFrom(detail.pullRequestUrl, detail.repoHost);
  const prLabel = pr === null ? null : m.home.meta.pr(pr);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [adding, setAdding] = useState<{ code: string | null } | null>(null);
  const [removing, setRemoving] = useState<{ code: string; adding: boolean } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const focus = useRef<Focus | null>(null);
  const help = !canManage ? m.sources.languagesHelpEditor : supported ? m.sources.languagesHelpOwner : m.sources.languagesHelp;
  const headerBlocked = !canManage || !supported;

  // 다른 소스로 바뀌면(닫힘 포함) 열린 창·안내를 버린다 — 남은 상태가 다음 소스에 서지 않게.
  useEffect(() => { setNotice(null); setAdding(null); setRemoving(null); focus.current = null; }, [detail.id]);
  useEffect(() => {
    const wanted = focus.current;
    const card = cardRef.current;
    if (wanted === null || card === null) return;
    const target = wanted.pick(card);
    if (target !== null) { focus.current = null; target.focus(); return; }
    // 다시 읽은 뒤에도 없으면 머리로 — 원래 자리가 사라졌다.
    if (wanted.detail !== detail) { focus.current = null; header(card)?.focus(); }
  });
  const landOn = (pick: Focus["pick"]) => { focus.current = { pick, detail }; };
  // 딥링크 착지 — 행은 카드와 함께 이미 서 있어 곧바로 옮긴다. 그 언어가 없으면 아무것도 하지 않는다(머리로 보내지 않는다).
  useEffect(() => {
    if (focusLanguage === null || cardRef.current === null) return;
    rowOf(cardRef.current, focusLanguage)?.querySelector<HTMLElement>("[data-language-action]")?.focus();
  }, [detail.id, focusLanguage]);
  /*
    ⚠️ **사람이 먼저 움직이면 예약을 버린다** — 다시 읽기가 실패하면 호스트가 같은 `detail`을 들고 있어 위 "머리로" 판정이 서지 않는다. 남은 예약은
    한참 뒤의 다음 다시 읽기에서 대상이 서는 순간 사람이 보던 자리의 포커스를 빼앗는다.
  */
  useEffect(() => {
    const drop = () => { focus.current = null; };
    document.addEventListener("pointerdown", drop, true);
    document.addEventListener("keydown", drop, true);
    return () => { document.removeEventListener("pointerdown", drop, true); document.removeEventListener("keydown", drop, true); };
  }, []);
  // 결과로 닫히는 창은 연 자리로 돌아가지 않는다 — 위 규칙이 옮긴다.
  const keepFocus = (event: Event) => { if (focus.current !== null) event.preventDefault(); };

  function added(outcome: AddOutcome) {
    setAdding(null);
    if (outcome.kind === "lost") { setNotice({ tone: "warning", text: t.addUnconfirmed(outcome.code) }); landOn(header); }
    else {
      setNotice({ tone: "success", text: outcome.action === "revive" ? t.addedAgain(outcome.code, outcome.reissued) : t.addedNotice(outcome.code) });
      landOn(card => rowOf(card, outcome.code)?.querySelector<HTMLElement>("[data-language-open]") ?? null);
    }
    onReload();
  }
  function removed(outcome: RemoveOutcome) {
    setRemoving(null);
    if (outcome.kind === "lost") { setNotice({ tone: "warning", text: t.removeUnconfirmed(outcome.code) }); landOn(header); }
    else if (outcome.kind === "request-removal") {
      setNotice({ tone: "success", text: t.removeRequested(outcome.code) });
      landOn(card => rowOf(card, outcome.code)?.querySelector<HTMLElement>("[data-language-action]") ?? null);
    } else {
      // 추가 취소 — 행이 Inactive로 끝에 간다. 전달된 추가였으면 PR에서 거둘 일이 남았다(spec 11).
      setNotice({ tone: "success", text: `${t.cancelAddDone(outcome.code, outcome.translations)}${outcome.delivered === false ? "" : ` ${t.publishToUpdate}`}` });
      landOn(header);
    }
    onReload();
  }
  async function cancelRemoval(code: string, button: HTMLElement) {
    if (cancelling !== null) return;
    setCancelling(code);
    try {
      const result = await cancelSourceLocaleRemoval({ slug, surfaceSlug: detail.slug, localeCode: code });
      if (result.ok) {
        // 전달된 제거를 거뒀으면 리포 쪽 일이 남았다 — "취소됨"으로 끝내지 않는다(spec 11). 확인 못 함(`null`)도 단정하지 않는다.
        setNotice({ tone: "success", text: `${t.staysIn(code, detail.slug)}${result.delivered === false ? "" : ` ${t.publishToUpdate}`}` });
        // 행이 제자리에 남는다 — 같은 행의 다음 동작([Remove language])이다.
        landOn(card => rowOf(card, code)?.querySelector<HTMLElement>("[data-language-action]") ?? null);
        onReload();
      } else {
        // 실패면 행도 포커스도 그대로다 — 다시 시도할 자리다.
        setNotice({ tone: "danger", text: result.error === "publish-unsettled" ? t.cancelUnsettled(code) : t.cancelFailed(code) });
        button.focus();
        // 다른 세션이 이미 취소했다 — 다시 읽지 않으면 행이 Removing으로 남아 같은 실패가 되풀이된다(R-E1 ⚪2).
        if (result.error === "no-removal") onReload();
      }
    } catch {
      setNotice({ tone: "warning", text: t.cancelUnconfirmed(code) });
      onReload();
    } finally {
      setCancelling(null);
    }
  }

  const orphaned = detail.languages.filter(row => row.orphaned);
  return <div ref={cardRef}>
    {/* 머리 수는 카드가 보이는 행 수다(시안 L2·L6·L7 — DS #276). 모달 설명 줄과 같은 출처다(`listedLanguageCount`). */}
    <Card title={m.sources.languages} count={listedLanguageCount(detail)} countLabel={m.sources.languageCount(listedLanguageCount(detail))}
      description={<span id={helpId}>{help}</span>}
      // 소스 전체의 언어 구성을 바꾸는 동작이라 행이 아니라 머리다(L1). 꺼져도 숨기지 않는다(L4).
      action={<Button data-language-add disabled={busy} aria-disabled={headerBlocked || undefined} aria-describedby={headerBlocked ? helpId : undefined}
        onClick={event => { if (headerBlocked) { event.preventDefault(); return; } setAdding({ code: null }); }}>{t.addLanguage}</Button>}
      notice={notice === null ? undefined : <Alert inset variant={notice.tone} live={notice.tone === "danger" ? "alert" : "status"} onDismiss={() => setNotice(null)}>{notice.text}</Alert>}>
      {detail.languages.length === 0 ? <p className="text-muted-foreground px-4 py-row-y text-xs">{m.locales.empty.description}</p>
        : <ul>{detail.languages.map((row, index) => {
          const plan = planLanguageRow(row, { canManage, supported: detail.connection !== undefined && supportsLocaleChanges(detail.connection.adapterName), unconfirmed });
          // 집계 두 쿼리 사이 적재가 바뀌어도 막대 합은 트랙을 넘지 않는다. 퍼센트는 완료만 센다.
          const done = Math.min(row.total, row.translated);
          const review = Math.min(Math.max(0, row.total - done), row.needsReview);
          const href = routes.surfaceTranslations(slug, detail.slug, { ns: ALL_NAMESPACES, language: row.code });
          return <li key={row.code} data-language-row={row.code} className={cn("flex items-center gap-4 px-4 py-row-y @max-form:flex-wrap @max-form:gap-y-2", index > 0 && "border-border border-t")}>
            <span className="flex w-[150px] shrink-0 items-center gap-2 @max-[850px]:w-[120px] @max-form:w-24">
              <span className={cn("flex", row.orphaned && "opacity-50")}><LocaleFlag code={row.code} /></span>
              <span className={cn("min-w-0 text-base wrap-anywhere", row.orphaned && "text-muted-foreground")}>{row.code}</span>
              {row.isBase && <Badge variant="soft-neutral">{m.locales.base}</Badge>}
            </span>
            <span className="flex w-[300px] shrink-0 flex-col gap-1.5 @max-[850px]:w-auto @max-[850px]:flex-1">
              <span className={cn("flex items-baseline text-xs", row.orphaned ? "text-gray-dim" : "text-muted-foreground")}>
                <span className={cn(!row.orphaned && "text-foreground")}>{row.percent}%</span><span className="ml-auto">{m.sources.translatedOfTotal(row.translated, row.total)}</span>
              </span>
              <Meter done={row.total === 0 ? 0 : (done / row.total) * 100} review={row.orphaned || row.total === 0 ? 0 : (review / row.total) * 100} dimmed={row.orphaned} />
            </span>
            {/*
              ⚠️ **좁은 폭(@max-form)은 세 줄이다**(L5) — ① 코드 + 진행률 ② 상태(전폭) ③ 동작 + [Open](오른쪽). 상태를 숨기지 않고 내린다(audit #42 —
              숨기면 `aria-hidden` Meter의 색 조각만 남는다). 비어 있으면 줄을 만들지 않는다.
              ⚠️ **줄은 `basis-full`이 나누고 순서는 DOM이 정한다** — `order-*`로 시각 순서를 따로 두면 Tab 순서와 읽는 순서가 갈린다(ListRow 규칙과 같다).
            */}
            <StatusCell plan={plan} row={row} prLabel={prLabel} prHref={detail.pullRequestUrl} />
            <span className="flex shrink-0 items-center gap-2 @max-form:ml-auto">
              <RowAction plan={plan} code={row.code} busy={busy} helpId={helpId} cancelling={cancelling === row.code}
                onAdd={() => setAdding({ code: row.code })}
                onRemove={() => setRemoving({ code: row.code, adding: row.change?.operation === "ADD" })}
                onCancel={button => void cancelRemoval(row.code, button)} />
              {canOpen && !row.orphaned ? <ButtonLink size="sm" data-language-open className="shrink-0" href={href} onClick={event => onNavigate(href, event)}>{m.sources.openLanguage}<ChevronRight className="text-muted-foreground size-3.5" aria-hidden /></ButtonLink>
                : busy ? <Button size="sm" className="shrink-0" disabled>{m.sources.openLanguage}</Button>
                : <><span id={`language-open-reason-${row.code}`} className="sr-only">{row.orphaned ? m.sources.orphanReason : openReason}</span><Button size="sm" className="shrink-0" aria-disabled aria-describedby={`language-open-reason-${row.code}`} onClick={event => event.preventDefault()}>{m.sources.openLanguage}</Button></>}
            </span>
          </li>;
        })}</ul>}
      {/* ⚠️ **사라짐 안내는 행이 아니라 카드 바닥의 띠다**(시안 `1c`) — 복구 길은 역할·포맷이 고른다(L3·L4). 지난 상태라 `live="off"`다. */}
      {orphaned.map(row => <div key={`missing-${row.code}`} className="border-divider border-t">
        <Alert inset size="sm" variant="danger" live="off">
          <span className="leading-translation"><span className="font-medium">{row.code}</span> {m.sources.orphanStrip(row.code).slice(row.code.length + 1)} <span className="text-muted-foreground">{m.sources.orphanStripRest(row.translated + row.needsReview)} {!canManage ? m.sources.orphanStripEditor : supported ? m.sources.orphanStripOwner : m.sources.orphanStripUnsupported}</span></span>
        </Alert>
      </div>)}
    </Card>
    {canManage && detail.connection !== undefined && <AddLocaleDialog open={adding !== null} onOpenChange={next => { if (!next) setAdding(null); }} slug={slug} source={detail.slug}
      adapterName={detail.connection.adapterName ?? ""} pathTemplate={detail.connection.pathTemplate} languages={detail.languages} initialCode={adding?.code ?? null}
      onDone={added} onCloseAutoFocus={keepFocus} />}
    {canManage && removing !== null && <RemoveLocaleDialog open onOpenChange={next => { if (!next) setRemoving(null); }} slug={slug} source={detail.slug}
      code={removing.code} adding={removing.adding} pullRequest={prLabel} onDone={removed} onCloseAutoFocus={keepFocus} />}
  </div>;
}

function rowOf(card: HTMLElement, code: string): HTMLElement | null {
  return [...card.querySelectorAll<HTMLElement>("[data-language-row]")].find(node => node.getAttribute("data-language-row") === code) ?? null;
}
function header(card: HTMLElement): HTMLElement | null {
  return card.querySelector<HTMLElement>("[data-language-add]");
}

function StatusCell({ plan, row, prLabel, prHref }: { plan: LanguageRowPlan; row: SourceDetail["languages"][number]; prLabel: string | null; prHref: string | null }) {
  const m = useMessages();
  const t = m.sources.locale;
  const chips = plan.badge !== null || plan.unsent || plan.notConfirmed || (plan.link && prLabel !== null) || (plan.badge === null && row.needsReview > 0);
  return <span className="flex min-w-0 flex-1 flex-col gap-1 text-xs @max-form:basis-full @max-form:empty:hidden">
    {chips && <span className="flex flex-wrap items-center gap-1.5">
      {plan.badge !== null && <StatusBadge state={plan.badge} />}
      {plan.badge === null && row.needsReview > 0 && <Badge variant="soft-amber">{m.sources.needReview(row.needsReview)}</Badge>}
      {plan.unsent && <StatusBadge state="unsent" />}
      {plan.notConfirmed && <span className="text-muted-foreground">{t.notConfirmed}</span>}
      {/* 링크는 저장된 마지막 Publish 주소에서 만든다 — 들어올 때 조회하지 않아 조회 실패 상태가 없다(D5). 새 탭이다. */}
      {plan.link && prLabel !== null && prHref !== null && <InlineLink href={prHref} target="_blank" rel="noreferrer" className="whitespace-nowrap">{t.viewPullRequest(prLabel)}</InlineLink>}
    </span>}
    {plan.note !== null && <span id={plan.note === "notConfirmedHelp" ? `language-note-${row.code}` : undefined} className="text-muted-foreground leading-normal">
      {plan.note === "baseRow" ? m.sources.baseRow : t[plan.note]}
    </span>}
  </span>;
}

function RowAction({ plan, code, busy, helpId, cancelling, onAdd, onRemove, onCancel }: {
  plan: LanguageRowPlan; code: string; busy: boolean; helpId: string; cancelling: boolean;
  onAdd: () => void; onRemove: () => void; onCancel: (button: HTMLElement) => void;
}) {
  const m = useMessages();
  const t = m.sources.locale;
  const { kind, block } = plan.action;
  // 사유의 자리: 기준 언어는 자기 sr 문장(+ title), 권한·포맷은 카드 설명, 전달 미확정은 행의 보조 줄이다(L1·L3·L4).
  const reasonId = block === "base" ? `language-action-reason-${code}` : block === "unconfirmed" ? `language-note-${code}` : block !== null ? helpId : undefined;
  const label = kind === "add" ? t.addLabel(code) : kind === "cancel" ? t.cancelLabel(code) : t.removeLabel(code);
  return <>
    {block === "base" && <span id={reasonId} className="sr-only">{t.baseReason}</span>}
    {/* 트리거가 danger다 — 승인 버튼과 같은 파괴 스타일이고 바닥 왼쪽 [Detach source]와 같은 계열이다(L1). 취소·재추가는 기본형이다. */}
    <Button size="sm" data-language-action variant={kind === "remove" ? "danger" : "default"} className="shrink-0" aria-label={label}
      title={block === "base" ? t.baseReason : undefined} disabled={busy} busy={cancelling}
      aria-disabled={block !== null || undefined} aria-describedby={reasonId}
      onClick={event => {
        if (block !== null) { event.preventDefault(); return; }
        if (kind === "add") onAdd(); else if (kind === "remove") onRemove(); else onCancel(event.currentTarget);
      }}>{kind === "add" ? t.addLanguage : kind === "cancel" ? t.cancelRemoval : t.removeLanguage}</Button>
  </>;
}
