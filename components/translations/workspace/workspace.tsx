"use client";

import { ArrowDownToLine, Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";

import { previewTranslationRevert, revertTranslationKey, saveTranslationKey } from "@/app/(edit)/actions";
import { PublishButton, PublishModal, usePublish } from "@/components/publish-button";
import { SearchInput } from "@/components/search-input";
import { SyncButton } from "@/components/home/sync-button";
import { BasePendingBanner } from "@/components/translations/base-pending-banner";
import { EditLossBanner } from "@/components/translations/edit-loss-banner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { TranslationList, TranslationListRow, TranslationTree } from "@/lib/keys/translation-list";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { dirtyLocales, initKeyDraft, planDraftRecovery, reduceKeyDraft, type KeyDraftAction, type KeyDraftState } from "@/lib/translations/draft";
import { planTranslationPanelLayout, stepPanelWidth, PANEL } from "@/lib/translations/layout";
import { planEditorNavigation, type EditorIntent } from "@/lib/translations/navigation";
import { ALL_NAMESPACES, clearFilters, DEFAULT_TRANSLATION_QUERY, nextQuery, translationsHref, treeQuery, type TranslationQuery } from "@/lib/translations/query";
import { applySavedRow, mergeServerRows, savedOutCount, startListGeneration, type ListGeneration } from "@/lib/translations/saved-rows";
import { summarizeKey } from "@/lib/translations/summary";
import { cn } from "@/lib/utils";

import { FilterMenu } from "./filter-menu";
import { KeyList } from "./key-list";
import { LocalePanel, type DetailView } from "./locale-panel";
import { TreePanel } from "./tree-panel";
import { useLeaveGuard } from "./use-leave-guard";

/**
 * **번역 작업 화면의 유일한 소유자** (translation-rework T13–T15 — spec §3 · design §6).
 *
 * draft · 목록 세대 · 이동 확인 · Save/Revert 결과가 **한 곳**에 산다. 트리·필터·검색·키 선택·셸 밖 이동·뒤로/앞으로가 전부
 * `planEditorNavigation` 하나를 지난다 — 이동 진입점마다 판정을 따로 두면 하나가 guard를 빠뜨린다(POSTMORTEM 2026-09-12 — 툴바만 잠금).
 *
 * ⚠️ **draft는 재검증으로 언마운트되지 않는다** — 같은 키의 서버 값은 `server` 액션으로 받고(미저장 입력 보존), 키가 바뀔 때만 새로 시작한다.
 * ⚠️ **결과 영역은 조건부 분기 밖이다** — `revalidatePath`가 방금 받은 결과를 언마운트하면 안 된다(ARCHITECTURE §0 불변식 9).
 */
export type WorkspaceProps = {
  slug: string;
  /** 경로의 소스 — 트리의 기준점. 전체 범위의 다른 소스 결과는 `query.keySurface`가 상세의 소스를 정한다. */
  routeSurfaceSlug: string;
  role: "OWNER" | "EDITOR";
  userId: string;
  query: TranslationQuery;
  tree: TranslationTree;
  list: TranslationList;
  /** `null`은 선택 없음, `absent`는 URL의 키가 사라졌다(부재 안내 — 다른 키로 바꾸지 않는다). */
  detail: DetailView | { absent: true; surfaceSlug: string } | null;
  unpublished: number;
  publish: { repo: { owner: string; name: string; branch: string; syncBranch: string }; lastSentLabel: string | null; lastPrUrl: string | null };
  sync: { name: string; branch: string };
  /** 기준 로케일의 **현실**과 **선언** — 대기 배너의 조건이다 (6b-3, `basePending`). 옛 헤더에서 옮겨 왔다. */
  baseLocale: string | null;
  declaredBaseLocale: string | null;
};

type DraftAction = KeyDraftAction | { type: "replace"; state: KeyDraftState };
const draftReducer = (state: KeyDraftState, action: DraftAction): KeyDraftState =>
  action.type === "replace" ? action.state : reduceKeyDraft(state, action);

function valuesOf(detail: DetailView | null): Record<string, string> {
  const out = Object.create(null) as Record<string, string>;
  for (const locale of detail?.locales ?? []) out[locale.code] = locale.value ?? "";
  return out;
}

type FooterStatus =
  | { kind: "saved" }
  | { kind: "save-failed" }
  | { kind: "save-unknown" }
  | { kind: "session" }
  | { kind: "archived" }
  | { kind: "lost-access" }
  | { kind: "reverted" }
  | { kind: "revert-failed" }
  | { kind: "revert-unknown" }
  | { kind: "restored"; count: number };

type DialogState =
  | { kind: "discard"; locales: string[]; proceed: () => void }
  | { kind: "publish"; locales: string[] }
  | { kind: "revert"; locales: { code: string; before: string; after: string }[]; confirmation: string }
  | { kind: "revert-changed" };

const REVERT_REASONS = {
  forbidden: () => m.translations.workspace.revert.forbidden,
  unsaved: () => m.translations.workspace.revert.unsaved,
  busy: () => m.translations.workspace.revert.busy,
  unavailable: () => m.translations.workspace.revert.unavailable,
} as const;
type RevertReason = keyof typeof REVERT_REASONS;

const storageKey = (userId: string, slug: string) => `malmoi.translation-draft.${userId}.${slug}`;
const widthKey = (userId: string, slug: string) => `malmoi.translation-panels.${userId}.${slug}`;

export function TranslationWorkspace(props: WorkspaceProps) {
  const { slug, routeSurfaceSlug, role, userId, query, tree, list } = props;
  const router = useRouter();
  const w = m.translations.workspace;
  const detail = props.detail !== null && !("absent" in props.detail) ? props.detail : null;
  const keyId = detail?.key.id;
  const detailSurface = detail?.key.surfaceSlug ?? routeSurfaceSlug;

  // ── draft ────────────────────────────────────────────────────────────────
  const [draft, dispatch] = useReducer(draftReducer, undefined, () => initKeyDraft(keyId ?? "", valuesOf(detail)));
  useEffect(() => {
    if (detail === null) { dispatch({ type: "replace", state: initKeyDraft("", valuesOf(null)) }); return; }
    if (detail.key.id !== draft.keyId) dispatch({ type: "replace", state: initKeyDraft(detail.key.id, valuesOf(detail)) });
    else dispatch({ type: "server", keyId: detail.key.id, values: valuesOf(detail) });
    // 같은 키의 재검증은 서버 값만 받는다 — draft는 보존된다(POSTMORTEM 2026-09-12).
  }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => (keyId === undefined ? [] : dirtyLocales(draft)), [draft, keyId]);

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const requestSeq = useRef(0);
  const [status, setStatus] = useState<FooterStatus | null>(null);
  const [revertedLocales, setRevertedLocales] = useState<ReadonlySet<string>>(new Set());
  const [revertReason, setRevertReason] = useState<RevertReason | null>(null);
  const [revertBusy, setRevertBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const resultRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setStatus(null); setRevertedLocales(new Set()); setRevertReason(null); }, [keyId]);

  // ── 세션 복구 사본 — 이 탭 sessionStorage의 한 키 draft, 사용자별 (spec §3.5) ───────────────────
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (keyId === undefined || restoredFor.current === keyId) return;
    restoredFor.current = keyId;
    try {
      const raw = window.sessionStorage.getItem(storageKey(userId, slug));
      if (raw === null) return;
      const copy = JSON.parse(raw) as { surfaceSlug?: unknown; keyId?: unknown; saved?: unknown; draft?: unknown };
      if (copy.keyId !== keyId || copy.surfaceSlug !== detailSurface || typeof copy.draft !== "object" || copy.draft === null || typeof copy.saved !== "object" || copy.saved === null) return;
      const saved = copy.saved as Record<string, unknown>;
      let count = 0;
      for (const [code, value] of Object.entries(copy.draft as Record<string, unknown>)) {
        if (typeof value !== "string" || !Object.hasOwn(draft.saved, code) || value === saved[code]) continue;
        dispatch({ type: "edit", locale: code, value });
        count += 1;
      }
      if (count > 0) setStatus({ kind: "restored", count });
    } catch {
      // 저장소가 막힌 브라우저 — 보존을 약속하지 않는다(세션 만료 문구가 그 갈래를 말한다).
    }
  }, [keyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (keyId === undefined || restoredFor.current !== keyId) return;
    try {
      const plan = planDraftRecovery(draft);
      if (plan.kind === "clear") window.sessionStorage.removeItem(storageKey(userId, slug));
      else window.sessionStorage.setItem(storageKey(userId, slug), JSON.stringify({ surfaceSlug: detailSurface, keyId, saved: plan.saved, draft: plan.draft }));
    } catch {
      // 위와 같다.
    }
  }, [draft, keyId, userId, slug, detailSurface]);

  // ── 목록 세대 — 조건이 바뀔 때만 새로 시작한다. 저장·재검증은 행을 자리에 남긴다 ────────────────────
  const conditionKey = JSON.stringify([routeSurfaceSlug, query.ns, query.scope, query.completion, query.missingLocale, query.state, query.q]);
  const [rows, setRows] = useState<ListGeneration<TranslationListRow>>(() => startListGeneration(list.rows, 0));
  const generation = useRef({ key: conditionKey, value: 0 });
  useEffect(() => {
    if (generation.current.key !== conditionKey) {
      generation.current = { key: conditionKey, value: generation.current.value + 1 };
      setRows(startListGeneration(list.rows, generation.current.value));
    } else if (query.cursor !== undefined) {
      // 다음 페이지 — 같은 세대에 이어 붙인다.
      setRows(prev => ({ generation: prev.generation, rows: [...prev.rows, ...list.rows.filter(r => !prev.rows.some(p => p.row.keyId === r.keyId)).map(row => ({ row, savedOut: false }))] }));
    } else {
      setRows(prev => mergeServerRows(prev, list.rows));
    }
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  // 트리 전환은 새 목록의 첫 키를 연다. 필터·검색은 선택이 결과 밖이면 상세를 비운다 — 다른 키를 자동 선택하지 않는다.
  const pendingSelection = useRef<"tree" | "filter" | null>(null);
  useEffect(() => {
    const reason = pendingSelection.current;
    pendingSelection.current = null;
    if (reason === "tree" && query.key === undefined && list.rows[0] !== undefined) {
      router.replace(translationsHref(slug, routeSurfaceSlug, { ...query, key: list.rows[0].keyId, keySurface: list.rows[0].surfaceSlug }));
    } else if (reason === "filter" && query.key !== undefined && list.selectedInResult === false) {
      const next: TranslationQuery = { ...query };
      delete next.key;
      delete next.keySurface;
      router.replace(translationsHref(slug, routeSurfaceSlug, next));
    }
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 이동 — 전부 한 판정을 지난다 ────────────────────────────────────────────
  function attempt(intent: EditorIntent, proceed: () => void) {
    const plan = planEditorNavigation({ dirtyLocales: dirty, saving, current: keyId }, intent);
    if (plan.action === "go") proceed();
    else if (plan.action === "confirm" && plan.dialog === "discard") setDialog({ kind: "discard", locales: plan.locales, proceed });
    else if (plan.action === "confirm") setDialog({ kind: "publish", locales: plan.locales });
  }
  const go = (href: string) => () => router.push(href);
  const withQuery = (next: TranslationQuery, surface = routeSurfaceSlug) => translationsHref(slug, surface, next);
  useLeaveGuard(dirty.length > 0, proceed => setDialog({ kind: "discard", locales: dirty, proceed }));

  function selectRow(row: TranslationListRow) {
    attempt({ kind: "select-key", target: row.keyId }, go(withQuery({ ...query, key: row.keyId, keySurface: row.surfaceSlug })));
  }
  function selectTree(surface: string, ns: string) {
    const next = treeQuery(query, ns);
    attempt({ kind: "tree", target: `${surface}/${ns}` }, () => { pendingSelection.current = "tree"; router.push(withQuery(next, surface)); });
  }
  function filter(patch: Partial<TranslationQuery>, kind: "filter" | "search" | "clear" = "filter") {
    const next = kind === "clear" ? clearFilters(query) : nextQuery(query, patch);
    attempt({ kind }, () => { pendingSelection.current = "filter"; router.push(withQuery(next)); });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    if (detail === null || savingRef.current || dirty.length === 0) return;
    const requestId = `r${++requestSeq.current}`;
    const changes = dirty.map(code => ({ localeCode: code, value: draft.draft[code] ?? "" }));
    savingRef.current = true;
    setSaving(true);
    setStatus(null);
    dispatch({ type: "submit", requestId });
    try {
      const result = await saveTranslationKey({ slug, surfaceSlug: detail.key.surfaceSlug, keyId: detail.key.id, changes });
      if (result.ok) {
        dispatch({ type: "success", requestId, keyId: detail.key.id, cells: result.cells });
        setStatus({ kind: "saved" });
        // 목록 행은 자리에 남기고 수만 최신 저장값으로 — 조건 이탈 여부는 재검증(`mergeServerRows`)이 정한다.
        const saved = { ...draft.saved, ...Object.fromEntries(result.cells.map(c => [c.localeCode, c.value])) };
        const summary = summarizeKey({
          activeLocales: detail.locales.map(l => l.code),
          cells: detail.locales.map(l => ({ localeCode: l.code, value: saved[l.code] ?? null, needsReview: l.needsReview && !result.cells.some(c => c.localeCode === l.code), pending: l.pending || result.cells.some(c => c.localeCode === l.code) })),
        });
        setRows(prev => {
          const current = prev.rows.find(entry => entry.row.keyId === detail.key.id);
          return current === undefined ? prev : applySavedRow(prev, { keyId: detail.key.id, row: { ...current.row, ...summary }, matches: !current.savedOut });
        });
      } else {
        dispatch({ type: "failure", requestId });
        setStatus(result.error === "unauthorized" ? { kind: "session" }
          : result.error === "archived" ? { kind: "archived" }
          : result.error === "forbidden" || result.error === "not-found" ? { kind: "lost-access" }
          : { kind: "save-failed" });
      }
    } catch {
      // 응답 유실 — 커밋됐는지 모른다. "전혀 저장되지 않음"으로 단정하지 않는다(spec §3.4).
      dispatch({ type: "failure", requestId });
      setStatus({ kind: "save-unknown" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // ── Revert ────────────────────────────────────────────────────────────────
  const pendingLocales = detail?.locales.filter(l => l.pending && !revertedLocales.has(l.code)).map(l => l.code) ?? [];
  const revertBlocked: RevertReason | null = role === "EDITOR" ? "forbidden"
    : dirty.length > 0 ? "unsaved"
    : saving || revertBusy ? "busy"
    : revertReason;
  async function openRevert() {
    if (detail === null || revertBlocked !== null) return;
    setRevertBusy(true);
    try {
      const preview = await previewTranslationRevert({ slug, surfaceSlug: detail.key.surfaceSlug, keyId: detail.key.id });
      if (preview.status === "ready") setDialog({ kind: "revert", locales: preview.locales, confirmation: preview.confirmation });
      else if (preview.status === "blocked") setRevertReason(preview.reason === "forbidden" ? "forbidden" : preview.reason === "busy" ? "busy" : preview.reason === "unsaved" ? "unsaved" : "unavailable");
      else setStatus({ kind: "revert-failed" });
    } catch {
      setStatus({ kind: "revert-failed" });
    } finally {
      setRevertBusy(false);
    }
  }
  async function confirmRevert(confirmation: string) {
    if (detail === null) return;
    setDialog(null);
    setRevertBusy(true);
    try {
      const result = await revertTranslationKey({ slug, surfaceSlug: detail.key.surfaceSlug, keyId: detail.key.id, confirmation });
      if (result.status === "reverted") {
        const values = { ...draft.saved, ...Object.fromEntries(result.cells.map(c => [c.localeCode, c.value])) };
        dispatch({ type: "server", keyId: detail.key.id, values });
        setRevertedLocales(new Set(result.cells.map(c => c.localeCode)));
        setStatus({ kind: "reverted" });
        // 성공 뒤 Revert가 사라지고 Save는 꺼져 있다 — 포커스를 결과 영역으로 옮긴다(disabled 버튼은 포커스를 못 받는다).
        requestAnimationFrame(() => resultRef.current?.focus());
        queueMicrotask(() => resultRef.current?.focus());
        router.refresh();
      } else if (result.status === "reconfirm") {
        setDialog({ kind: "revert-changed" });
      } else if (result.status === "blocked") {
        setRevertReason(result.reason === "busy" ? "busy" : result.reason === "forbidden" ? "forbidden" : "unavailable");
      } else {
        setStatus({ kind: "revert-failed" });
      }
    } catch {
      setStatus({ kind: "revert-unknown" });
    } finally {
      setRevertBusy(false);
    }
  }

  // ── Publish · Sync ────────────────────────────────────────────────────────
  const publish = usePublish(slug);
  const syncReasonId = useId();
  const publishButtonId = useId();
  const [syncOpen, setSyncOpen] = useState(false);

  // ── 폭 ────────────────────────────────────────────────────────────────────
  const bodyRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<number | null>(null);
  const [preferredLeft, setPreferredLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    try { const raw = window.localStorage.getItem(widthKey(userId, slug)); if (raw !== null && Number.isFinite(Number(raw))) setPreferredLeft(Number(raw)); } catch { /* 메모리 폴백 */ }
    const node = bodyRef.current;
    if (node === null || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width !== undefined) setArea(width); });
    observer.observe(node);
    return () => observer.disconnect();
  }, [userId, slug]);
  const layout = planTranslationPanelLayout({ area, preferredLeft });
  function rememberLeft(value: number) {
    setPreferredLeft(value);
    try { window.localStorage.setItem(widthKey(userId, slug), String(value)); } catch { /* 메모리 폴백 */ }
  }
  const [treeOverlay, setTreeOverlay] = useState(false);
  const treeCollapsed = layout !== null && layout.tree === null;

  // ── 머리 ──────────────────────────────────────────────────────────────────
  const surfaceLocales = [...new Set(tree.surfaces.flatMap(s => s.locales))].sort();
  const noKeys = tree.projectKeyCount === 0;
  const completionLabel = query.completion === "missing" && query.missingLocale !== undefined ? w.filters.completion.missingIn(query.missingLocale)
    : w.filters.completion[query.completion === "missing" ? "all" : query.completion];
  const stateLabel = query.state === undefined ? w.filters.state.any : w.filters.state[query.state];
  const scopeLabel = w.filters.scope[query.scope];
  const narrowed = query.completion !== "all" || query.state !== undefined || query.scope !== DEFAULT_TRANSLATION_QUERY.scope;
  const substituted = list.effective.substituted && query.missingLocale !== undefined;

  const listTitle = query.completion === "incomplete" ? w.list.incompleteKeys : w.list.keys;
  const listEmpty = (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-sm">{query.q !== undefined ? w.empty.noMatch(query.q) : noKeys ? w.empty.noActive : w.empty.filteredOut}</p>
      {query.q !== undefined
        ? <Button size="sm" onClick={() => filter({ q: undefined }, "search")}>{w.empty.clearSearch}</Button>
        : narrowed && <Button size="sm" onClick={() => filter({}, "clear")}>{w.empty.showAll(tree.projectKeyCount)}</Button>}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 flex-col gap-3 border-b p-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2">
            <h1 ref={titleRef} tabIndex={-1} className="text-lg font-medium">{m.common.nav.translations}</h1>
            <Badge variant="neutral">
              <span aria-hidden>{tree.projectKeyCount.toLocaleString("en-US")}</span>
              <span className="sr-only">{m.translations.keys(tree.projectKeyCount)}</span>
            </Badge>
          </span>
          <span className="ml-auto flex items-center gap-2">
            {role === "OWNER" ? (
              <span onClickCapture={event => { if (dirty.length > 0) { event.preventDefault(); event.stopPropagation(); attempt({ kind: "sync" }, () => setSyncOpen(true)); } }}>
                <SyncButton slug={slug} name={props.sync.name} branch={props.sync.branch} role={role} unsent={props.unpublished}
                  open={syncOpen} onOpenChange={setSyncOpen} onResult={() => router.refresh()} fallbackFocusRef={titleRef} />
              </span>
            ) : (
              <>
                <Button aria-disabled="true" title={w.sync.ownerOnly} aria-describedby={syncReasonId} onClick={event => event.preventDefault()}>
                  <ArrowDownToLine className="text-neutral-600" aria-hidden />
                  {m.repositorySync.action}
                </Button>
                <span id={syncReasonId} className="sr-only">{w.sync.ownerOnly}</span>
              </>
            )}
            <span onClickCapture={event => { if (dirty.length > 0 && !publish.pending) { event.preventDefault(); event.stopPropagation(); setDialog({ kind: "publish", locales: dirty }); } }}>
              <PublishButton id={publishButtonId} count={props.unpublished} publish={publish} />
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu axis={w.filters.completion.axis} label={completionLabel} on={query.completion !== "all"} size="md" disabled={noKeys}
            value={query.completion === "missing" ? `missing:${query.missingLocale ?? ""}` : query.completion}
            options={[
              { value: "all", label: w.filters.completion.all },
              { value: "incomplete", label: w.filters.completion.incomplete },
              { value: "complete", label: w.filters.completion.complete },
              ...surfaceLocales.map(code => ({ value: `missing:${code}`, label: w.filters.completion.missingIn(code), group: w.filters.completion.missingMenu })),
            ]}
            onSelect={value => value.startsWith("missing:") ? filter({ completion: "missing", missingLocale: value.slice("missing:".length) }) : filter({ completion: value as TranslationQuery["completion"] })}
          />
          <FilterMenu axis={w.filters.state.axis} label={stateLabel} on={query.state !== undefined} size="md" disabled={noKeys}
            value={query.state ?? ""} hint={w.filters.state.newHint}
            options={[
              { value: "", label: w.filters.state.any },
              { value: "unsent", label: w.filters.state.unsent },
              { value: "review", label: w.filters.state.review },
              { value: "new", label: w.filters.state.new },
            ]}
            onSelect={value => filter({ state: value === "" ? undefined : value as TranslationQuery["state"] })}
          />
          <FilterMenu axis={w.filters.scope.axis} label={scopeLabel} on={query.scope !== "source"} size="md" disabled={noKeys}
            value={query.scope}
            options={[
              { value: "namespace", label: w.filters.scope.namespace },
              { value: "source", label: w.filters.scope.source },
              { value: "project", label: w.filters.scope.project },
            ]}
            onSelect={value => filter({ scope: value as TranslationQuery["scope"] })}
          />
          {narrowed && <Button variant="ghost" onClick={() => filter({}, "clear")}>{w.filters.clear}</Button>}
          {noKeys && <span className="text-muted-foreground text-xs">{w.filters.nothingToFilter}</span>}
          <SearchInput className="ml-auto" value={query.q} label={w.filters.search} onSearch={q => filter({ q: q === "" ? undefined : q }, "search")} />
        </div>
        {substituted && (
          <p className="text-muted-foreground text-xs">{w.filters.substituted(routeSurfaceSlug, query.missingLocale ?? "")}</p>
        )}
        {/*
          ⚠️ **두 배너는 조건부 분기 밖의 형제다** (DESIGN §6.1 · POSTMORTEM 2026-09-07) — 분기 안에 두면 `router.refresh()`가 방금 만든
          상태를 언마운트한다. 대기 배너가 먼저다: "왜 지금 보내야 하는가"가 "보내라"보다 앞이다.
        */}
        <div className="space-y-3 empty:hidden">
          <BasePendingBanner baseLocale={props.baseLocale} declaredBaseLocale={props.declaredBaseLocale} />
          <EditLossBanner count={props.unpublished} publishButtonId={publishButtonId} />
        </div>
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex h-full min-h-0" style={layout?.scrollWidth ? { minWidth: layout.scrollWidth } : undefined}>
          <div className="border-border bg-background relative flex min-h-0 shrink-0 overflow-hidden rounded-xl border" style={layout ? { width: layout.left } : { width: PANEL.tree + PANEL.list }}>
            {!treeCollapsed && (
              <TreePanel tree={tree} surfaceSlug={routeSurfaceSlug} ns={query.scope === "namespace" ? query.ns : ALL_NAMESPACES} onSelect={selectTree}
                className="border-border shrink-0 border-r" width={layout?.tree ?? PANEL.tree} />
            )}
            <KeyList
              list={rows}
              title={listTitle}
              count={list.matchedKeyCount}
              savedExtra={savedOutCount(rows)}
              selectedKeyId={keyId}
              showSource={query.scope === "project"}
              onSelect={selectRow}
              onMore={list.nextCursor === null ? null : () => router.push(withQuery({ ...query, cursor: list.nextCursor ?? undefined }))}
              treeButton={treeCollapsed ? { open: treeOverlay, onToggle: () => setTreeOverlay(v => !v), breadcrumb: <span className="text-muted-foreground text-xs">{routeSurfaceSlug}</span> } : undefined}
              empty={listEmpty}
            />
            {treeCollapsed && treeOverlay && (
              <TreeOverlay onClose={() => setTreeOverlay(false)}>
                <TreePanel tree={tree} surfaceSlug={routeSurfaceSlug} ns={query.scope === "namespace" ? query.ns : ALL_NAMESPACES}
                  onSelect={(surface, ns) => { setTreeOverlay(false); selectTree(surface, ns); }} />
              </TreeOverlay>
            )}
          </div>
          <ResizeHandle layout={layout} onChange={rememberLeft} />
          <div className="border-border bg-background flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border">
            {detail === null ? (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState icon={Languages} title={props.detail !== null && "absent" in props.detail ? w.detail.keyGone(props.detail.surfaceSlug) : w.detail.selectKey} />
              </div>
            ) : (
              <LocalePanel
                detail={{ ...detail, locales: detail.locales.map(l => ({ ...l, pending: l.pending && !revertedLocales.has(l.code) })) }}
                draft={draft}
                language={query.language}
                onLanguage={language => router.replace(withQuery(nextQuery(query, { language })))}
                onEdit={(code, value) => dispatch({ type: "edit", locale: code, value })}
                onReset={code => dispatch({ type: "reset", locale: code })}
                onSave={() => void save()}
                copyHref={withQuery({ ...DEFAULT_TRANSLATION_QUERY, ns: detail.key.namespace, scope: "namespace", key: detail.key.id, keySurface: detail.key.surfaceSlug }, detail.key.surfaceSlug)}
                readOnly={status?.kind === "archived" || status?.kind === "lost-access"}
                footer={
                  <Footer
                    dirty={dirty.length}
                    status={status}
                    saving={saving}
                    resultRef={resultRef}
                    hasPending={pendingLocales.length > 0}
                    revertBlocked={revertBlocked}
                    revertBusy={revertBusy}
                    saveDisabled={dirty.length === 0 || status?.kind === "archived" || status?.kind === "lost-access"}
                    onSave={() => void save()}
                    onRevert={() => void openRevert()}
                    onCheck={() => { setStatus(null); router.refresh(); }}
                    slug={slug}
                  />
                }
              />
            )}
          </div>
        </div>
      </div>

      <PublishModal slug={slug} publish={publish} fallbackFocusRef={titleRef} count={props.unpublished} repo={props.publish.repo} role={role} />
      <WorkspaceDialog
        dialog={dialog}
        keyName={detail?.key.key ?? ""}
        projectName={props.sync.name}
        onClose={() => setDialog(null)}
        onPreview={() => { setDialog(null); publish.launch(); }}
        onRevert={confirmation => void confirmRevert(confirmation)}
        onReview={() => { setDialog(null); router.refresh(); }}
      />
    </div>
  );
}

function Footer({ dirty, status, saving, resultRef, hasPending, revertBlocked, revertBusy, saveDisabled, onSave, onRevert, onCheck, slug }: {
  dirty: number; status: FooterStatus | null; saving: boolean; resultRef: React.RefObject<HTMLSpanElement | null>;
  hasPending: boolean; revertBlocked: RevertReason | null; revertBusy: boolean; saveDisabled: boolean;
  onSave: () => void; onRevert: () => void; onCheck: () => void; slug: string;
}) {
  const w = m.translations.workspace;
  const reasonId = useId();
  const text = dirty > 0 ? (status?.kind === "saved" ? w.footer.savedSince(dirty) : w.footer.unsaved(dirty))
    : status?.kind === "saved" ? (hasPending ? w.footer.savedNotSent : w.footer.saved)
    : status?.kind === "reverted" ? w.revert.reverted
    : status?.kind === "restored" ? w.footer.session.restored(status.count)
    : "";
  return (
    <div className="border-border shrink-0 border-t">
      {status !== null && ALERTS[status.kind] !== undefined && (
        <div className="px-4 pt-3">{ALERTS[status.kind]?.({ onCheck, slug })}</div>
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        <span ref={resultRef} tabIndex={-1} data-footer-result="true" aria-live="polite"
          className={cn("min-w-0 text-xs tracking-[0.02em] focus:outline-none", dirty > 0 ? "text-amber-700" : "text-muted-foreground")}>
          {text}
          {hasPending && revertBlocked !== null && <span id={reasonId} className="text-muted-foreground block">{REVERT_REASONS[revertBlocked]()}</span>}
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          {hasPending && (
            <Button aria-disabled={revertBlocked !== null ? "true" : undefined} aria-describedby={revertBlocked !== null ? reasonId : undefined}
              loading={revertBusy} onClick={() => { if (revertBlocked === null) onRevert(); }}>
              {w.revert.button}
            </Button>
          )}
          <Button variant="primary" loading={saving} disabled={saveDisabled} onClick={onSave}>{w.footer.save}</Button>
        </span>
      </div>
    </div>
  );
}

const ALERTS: Partial<Record<FooterStatus["kind"], (ctx: { onCheck: () => void; slug: string }) => ReactNode>> = {
  "save-failed": () => <Alert variant="danger" title={m.translations.workspace.footer.saveFailed.title}>{m.translations.workspace.footer.saveFailed.body}</Alert>,
  "save-unknown": () => <Alert variant="danger" title={m.translations.workspace.footer.saveUnknown.title}>{m.translations.workspace.footer.saveUnknown.body}</Alert>,
  session: () => (
    <Alert variant="danger" title={m.translations.workspace.footer.session.title}>
      {m.translations.workspace.footer.session.body}{" "}
      <a href={routes.signIn()} target="_blank" rel="noreferrer" className="text-blue-600">{m.translations.workspace.footer.session.signIn}</a>
    </Alert>
  ),
  archived: () => <Alert variant="danger" title={m.translations.workspace.footer.archived} />,
  "lost-access": () => <Alert variant="danger" title={m.translations.workspace.footer.lostAccess} />,
  "revert-failed": () => <Alert variant="danger" title={m.translations.workspace.revert.failed.title}>{m.translations.workspace.revert.failed.body}</Alert>,
  "revert-unknown": ({ onCheck }) => (
    <Alert variant="danger" title={m.translations.workspace.revert.unknown.title}>
      {m.translations.workspace.revert.unknown.body}{" "}
      <Button size="sm" onClick={onCheck}>{m.translations.workspace.revert.unknown.check}</Button>
    </Alert>
  ),
};

function WorkspaceDialog({ dialog, keyName, projectName, onClose, onPreview, onRevert, onReview }: {
  dialog: DialogState | null; keyName: string; projectName: string;
  onClose: () => void; onPreview: () => void; onRevert: (confirmation: string) => void; onReview: () => void;
}) {
  const w = m.translations.workspace;
  const open = dialog !== null;
  let title = "";
  let description: string | undefined = undefined;
  let footer: ReactNode = null;
  if (dialog?.kind === "discard") {
    title = w.discard.title;
    description = w.discard.body(keyName, dialog.locales.join(", "), dialog.locales.length);
    footer = <>
      <DialogClose asChild><Button autoFocus>{w.discard.keep}</Button></DialogClose>
      <Button variant="danger" onClick={() => { const proceed = dialog.proceed; onClose(); proceed(); }}>{w.discard.discard}</Button>
    </>;
  } else if (dialog?.kind === "publish") {
    title = w.publish.title;
    description = w.publish.body(projectName, dialog.locales.join(", "), keyName, dialog.locales.length);
    footer = <>
      <DialogClose asChild><Button autoFocus>{w.publish.keep}</Button></DialogClose>
      <Button variant="primary" onClick={onPreview}>{w.publish.preview}</Button>
    </>;
  } else if (dialog?.kind === "revert") {
    title = w.revert.title;
    description = w.revert.body(dialog.locales.length, dialog.locales.map(l => l.code).join(", "));
    footer = <>
      <DialogClose asChild><Button autoFocus>{m.common.cancel}</Button></DialogClose>
      <Button variant="danger" onClick={() => onRevert(dialog.confirmation)}>{w.revert.confirm}</Button>
    </>;
  } else if (dialog?.kind === "revert-changed") {
    title = w.revert.changed.title;
    description = w.revert.changed.body;
    footer = <Button autoFocus onClick={onReview}>{w.revert.changed.again}</Button>;
  }
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      {open && <DialogContent title={title} description={description} footer={footer} />}
    </Dialog>
  );
}

/** 접힌 트리를 여는 겹친 패널 280 · 최대 320 (README §7). Escape·바깥 클릭으로 닫는다. */
function TreeOverlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const outside = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose(); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, [onClose]);
  return (
    <div ref={ref} className="border-border bg-popover shadow-medium absolute top-14 left-3 z-20 flex max-h-80 w-70 flex-col overflow-hidden rounded-xl border">
      {children}
    </div>
  );
}

/**
 * 두 카드 사이 16px이 손잡이다 — 새 선이나 점을 그리지 않는다(README §7). hover·drag에만 4px 바가 뜨는 형은 `resizable.tsx`와 같다.
 * ⚠️ `react-resizable-panels`를 쓰지 않는다 — 이 계약은 **px**이고(목록 → 트리 → 접힘 순서), 그 라이브러리는 % 전용이다.
 */
function ResizeHandle({ layout, onChange }: { layout: ReturnType<typeof planTranslationPanelLayout>; onChange: (value: number) => void }) {
  const [drag, setDrag] = useState<{ start: number; origin: number } | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const current = value ?? layout?.left ?? PANEL.tree + PANEL.list;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(current)}
      aria-valuemin={layout?.bounds.min}
      aria-valuemax={layout?.bounds.max}
      tabIndex={0}
      data-state={drag !== null ? "drag" : undefined}
      onKeyDown={event => {
        if (layout === null) return;
        const next = stepPanelWidth(layout.left, event.key, layout.bounds);
        if (next === null) return;
        event.preventDefault();
        onChange(next);
      }}
      onPointerDown={event => {
        if (layout === null) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDrag({ start: event.clientX, origin: layout.left });
      }}
      onPointerMove={event => {
        if (drag === null || layout === null) return;
        const next = Math.min(layout.bounds.max, Math.max(layout.bounds.min, drag.origin + event.clientX - drag.start));
        setValue(next);
        onChange(next);
      }}
      onPointerUp={() => { setDrag(null); setValue(null); }}
      className={cn(
        "group relative w-4 shrink-0 cursor-col-resize focus-visible:outline-none",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 after:bg-gradient-to-b after:from-transparent after:via-ring after:to-transparent",
        "after:opacity-0 hover:after:opacity-100 focus-visible:after:opacity-100 data-[state=drag]:after:opacity-100",
      )}
    />
  );
}
