"use client";

import { ArrowDownToLine, Languages, Loader2, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useMemo, useOptimistic, useReducer, useRef, useState, useTransition, type ReactNode } from "react";

import { loadMoreTranslationKeys, previewTranslationRevert, revertTranslationKey, saveTranslationKey } from "@/app/(edit)/actions";
import { PublishButton, PublishModal, usePublish } from "@/components/publish-button";
import { SearchInput } from "@/components/search-input";
import { SyncButton } from "@/components/home/sync-button";
import { SyncResult } from "@/components/home/sync-result";
import { BasePendingBanner } from "@/components/translations/base-pending-banner";
import { EditLossBanner } from "@/components/translations/edit-loss-banner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useLandAfter } from "@/components/ui/focus";
import type { RepositoryImportOutcome } from "@/lib/import/result";
import type { TranslationList, TranslationListRow, TranslationTree } from "@/lib/keys/translation-list";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { dirtyLocales, initKeyDraft, planDraftRecovery, reduceKeyDraft, type KeyDraftAction, type KeyDraftState } from "@/lib/translations/draft";
import { planTranslationPanelLayout, stepPanelWidth, PANEL } from "@/lib/translations/layout";
import { planEditorNavigation, type EditorIntent } from "@/lib/translations/navigation";
import { ALL_NAMESPACES, clearFilters, DEFAULT_TRANSLATION_QUERY, FIRST_KEY, nextQuery, serializeTranslationQuery, translationsHref, treeQuery, type TranslationQuery } from "@/lib/translations/query";
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
  /** 다시 해도 안 풀리는 저장 거부 둘 (audit #23) — `save-failed`의 "Try again"으로 접지 않는다. */
  | { kind: "key-gone" }
  | { kind: "not-ready" }
  | { kind: "save-unknown" }
  /** 수술적 표면의 비-base 비우기 거부 (delivery-invariants D2) — 아무것도 저장되지 않았다. 입력은 그대로 남는다. */
  | { kind: "cannot-clear"; locales: string[] }
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
  const { slug, routeSurfaceSlug, role, userId, tree, list } = props;
  const router = useRouter();
  /*
    ⚠️ **상세의 언어 필터는 서버로 가지 않는다** (audit-ux #16) — 거르기는 받은 상세 위의 클라이언트 일이라 `history.replaceState`로
    주소만 맞춘다(`useProjectQuery`와 같은 형). ⚠️ **원천은 서버 prop이 아니라 주소다** — `replaceState`는 prop을 못 바꾸므로 prop을
    원천으로 두면 뒤로가기로 돌아온 화면이 캐시된 렌더의 옛 언어로 선다. 주소가 밖에서 바뀌면 렌더 중에 따라간다.
    모든 이동 주소(`current`)가 이 값을 잇는다 — 서버 prop의 `language`로 조립하면 다음 키 이동이 필터를 잃는다.
  */
  const params = useSearchParams();
  const languageFromUrl = params.get("language") || undefined;
  const [language, setLanguage] = useState(languageFromUrl);
  const [seenLanguage, setSeenLanguage] = useState(languageFromUrl);
  if (seenLanguage !== languageFromUrl) {
    setSeenLanguage(languageFromUrl);
    setLanguage(languageFromUrl);
  }
  const query = nextQuery(props.query, { language });
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
  /**
   * 방금 저장한 셀 — 저장은 편집 토큰을 세우므로 곧 미전달이다 (audit-ux #30). 서버 상세(`pending`)를 기다리면 푸터가 "Saved" →
   * "Saved · not sent yet"으로 두 번 바뀌고 `aria-live`가 두 번 읽는다. 목록 행은 이미 이렇게 한다. 다음 서버 상세까지만 유효하다.
   */
  const [savedLocales, setSavedLocales] = useState<ReadonlySet<string>>(new Set());
  const [revertReason, setRevertReason] = useState<RevertReason | null>(null);
  const [revertBusy, setRevertBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const resultRef = useRef<HTMLSpanElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setStatus(null); setRevertedLocales(new Set()); setSavedLocales(new Set()); setRevertReason(null); }, [keyId]);
  useEffect(() => {
    // Revert·Save 응답의 낙관적 표시는 다음 서버 상세까지만 유효하다. 이후의 편집 토큰을 가리지 않는다.
    setRevertedLocales(new Set());
    setSavedLocales(new Set());
    setRevertReason(null);
  }, [detail]);

  // ── 세션 복구 사본 — 이 탭 sessionStorage의 한 키 draft, 사용자별 (spec §3.5) ───────────────────
  const restoredFor = useRef<string | null>(null);
  /** 복구 사본을 못 읽거나 못 썼다 — 세션 만료 Alert가 보존을 약속하지 않는다 (ARCHITECTURE §6.04 · malmoi#76). */
  const [storageBlocked, setStorageBlocked] = useState(false);
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
      setStorageBlocked(true);
    }
  }, [keyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // 키가 바뀐 커밋의 `draft`는 아직 옛 키의 것이다 — 그대로 쓰면 옛 입력이 새 키의 사본으로 적힌다.
    if (keyId === undefined || restoredFor.current !== keyId || draft.keyId !== keyId) return;
    try {
      const plan = planDraftRecovery(draft);
      /*
        ⚠️ **다른 키의 사본은 지우지 않는다** (audit-ux #1 · D-U1a) — 확인창을 거치지 않은 교체(깨끗할 때 누른 뒤로가기 뒤의 입력 등)가
        남긴 사본이 돌아왔을 때 되살릴 마지막 그물이다. 명시적 폐기는 `discardThen`이 따로 지운다.
      */
      if (plan.kind === "clear") {
        const raw = window.sessionStorage.getItem(storageKey(userId, slug));
        if (raw === null || (JSON.parse(raw) as { keyId?: unknown }).keyId === keyId) window.sessionStorage.removeItem(storageKey(userId, slug));
      }
      else window.sessionStorage.setItem(storageKey(userId, slug), JSON.stringify({ surfaceSlug: detailSurface, keyId, saved: plan.saved, draft: plan.draft }));
    } catch {
      // 위와 같다.
      setStorageBlocked(true);
    }
  }, [draft, keyId, userId, slug, detailSurface]);

  // ── 목록 세대 — 조건이 바뀔 때만 새로 시작한다. 저장·재검증은 행을 자리에 남긴다 ────────────────────
  /*
    ⚠️ **새 목록은 렌더 중에 받는다, effect가 아니다** (audit-ux #29) — effect로 받으면 조건이 바뀐 첫 커밋이 새 제목·수 아래 옛 행을
    그렸고, 결과가 0↔N으로 바뀔 때 빈 상태가 한 프레임 번쩍였다.
    ⚠️ **More로 붙인 행은 이 화면이 든다** (audit-ux #19) — 재검증은 언제나 첫 페이지라 그 밖의 행은 `mergeServerRows`가 자리에 남기고,
    다음 cursor도 붙인 페이지 뒤의 것을 지킨다(첫 페이지의 cursor로 되돌아가면 같은 행을 다시 붙인다).
  */
  const conditionKey = JSON.stringify([routeSurfaceSlug, query.ns, query.scope, query.completion, query.missingLocale, query.state, query.q]);
  /** `more`도 세대에 묶는다 — 새 조건에서 옛 조건의 실패 문구가 남거나, 옛 조건의 늦은 응답이 새 목록의 버튼을 잠그지 않게. */
  type ListState = { source: typeof list; key: string; rows: ListGeneration<TranslationListRow>; cursor: string | null; extended: boolean; more: "idle" | "loading" | "failed" };
  const [listState, setListState] = useState<ListState>(() => ({ source: list, key: conditionKey, rows: startListGeneration(list.rows, 0), cursor: list.nextCursor, extended: false, more: "idle" }));
  let shownList = listState;
  if (listState.source !== list) {
    if (listState.key !== conditionKey) {
      shownList = { source: list, key: conditionKey, rows: startListGeneration(list.rows, listState.rows.generation + 1), cursor: list.nextCursor, extended: false, more: "idle" };
    } else {
      // 서버 응답은 첫 페이지다. 페이지 밖의 행은 유지하고, 전체 조건 판정이 있는 선택 키만 이탈 여부를 갱신한다.
      const membership = new Map<string, boolean>();
      if (query.key !== undefined && list.selectedInResult !== null) membership.set(query.key, list.selectedInResult);
      shownList = { ...listState, source: list, rows: mergeServerRows(listState.rows, list.rows, membership), cursor: listState.extended ? listState.cursor : list.nextCursor };
    }
    setListState(shownList);
  }
  const rows = shownList.rows;
  const setRows = (update: (prev: ListGeneration<TranslationListRow>) => ListGeneration<TranslationListRow>) => setListState(prev => ({ ...prev, rows: update(prev.rows) }));

  /** 요청 중인 세대 — 연타는 막고, 조건이 바뀐 뒤의 새 세대는 옛 요청을 기다리지 않는다. */
  const moreBusy = useRef<number | null>(null);
  async function loadMore() {
    const { cursor, rows: { generation } } = shownList;
    if (cursor === null || moreBusy.current === generation) return;
    moreBusy.current = generation;
    // 기다리는 동안 조건이 바뀌었으면 옛 조건의 응답이다 — 새 세대의 행·문구·버튼을 건드리지 않는다.
    const settle = (update: (prev: ListState) => ListState) => setListState(prev => prev.rows.generation === generation ? update(prev) : prev);
    settle(prev => ({ ...prev, more: "loading" }));
    try {
      const result = await loadMoreTranslationKeys({ slug, surfaceSlug: routeSurfaceSlug, query: serializeTranslationQuery(query), cursor });
      if (result.ok) {
        settle(prev => {
          const known = new Set(prev.rows.rows.map(entry => entry.row.keyId));
          const appended = result.rows.filter(row => !known.has(row.keyId)).map(row => ({ row, savedOut: false }));
          return { ...prev, rows: { generation, rows: [...prev.rows.rows, ...appended] }, cursor: result.nextCursor, extended: true, more: "idle" };
        });
      } else {
        /*
          ⚠️ **상태 때문의 거부는 그 상태로 옮긴다** (POSTMORTEM 2026-09-24 — "그 화면이 그 상태를 알고 있나") — 보관·권한 상실·세션
          만료를 "다시 시도"로 말하면 다시 눌러도 같은 거부다. 저장 거부와 같은 푸터 상태·편집 잠금을 쓴다.
        */
        const refusal: FooterStatus | null = result.error === "archived" ? { kind: "archived" }
          : result.error === "forbidden" || result.error === "not-found" ? { kind: "lost-access" }
          : result.error === "unauthorized" ? { kind: "session" }
          : null;
        if (refusal !== null) setStatus(refusal);
        settle(prev => ({ ...prev, more: refusal === null ? "failed" : "idle" }));
      }
    } catch {
      settle(prev => ({ ...prev, more: "failed" }));
    } finally {
      if (moreBusy.current === generation) moreBusy.current = null;
    }
  }

  /*
    ⚠️ **이동이 대기 중이면 상세가 읽기 전용이다** (audit-ux #1) — 확인창 판정은 클릭 시점의 draft로 끝나는데 응답 전까지 옛 키의
    칸이 그대로 서 있어, 거기 친 입력이 새 상세가 오는 순간 확인 없이 교체됐다. 대기는 transition이 센다 — 응답이 커밋되거나
    다음 이동이 앞 이동을 대신하면 풀리므로 해제 계기를 따로 두지 않는다.
  */
  const [navigating, startNavigation] = useTransition();
  /*
    ⚠️ **누른 것은 응답 전에 먼저 선다** (audit-ux #7) — 선택 행·필터 라벨·트리 선택은 `navigating` transition 안의 낙관값이고,
    응답이 커밋되면(또는 다음 이동이 앞 이동을 대신하면) 서버 값으로 돌아간다. 목록의 제목·수·행은 응답이 와야 바뀐다 —
    그쪽을 낙관적으로 먼저 바꾸면 새 제목 아래 옛 행이 선다(#29).
  */
  type View = { query: TranslationQuery; keyId: string | undefined; surface: string };
  const [view, setView] = useOptimistic<View>({ query, keyId, surface: routeSurfaceSlug });
  function navigate(href: string, how: "push" | "replace" = "push", optimistic?: Partial<View>) {
    startNavigation(() => {
      if (optimistic !== undefined) setView(prev => ({ ...prev, ...optimistic }));
      router[how](href);
    });
  }

  // ⚠️ 트리 이동의 첫 키는 서버가 같은 렌더에서 고른다 (audit-ux #18) — 주소에 남은 예약값만 그 키로 맞춘다(서버 왕복 없음).
  // ⚠️ **대기 중에는 부르지 않는다** — Next 16.3의 `replaceState`는 ACTION_RESTORE로 대기 중인 이동을 버린다. 대기가 끝나는 커밋에 다시 돈다.
  useEffect(() => {
    if (!navigating && params.get("key") === FIRST_KEY) window.history.replaceState(null, "", translationsHref(slug, routeSurfaceSlug, query));
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // 필터·검색은 선택이 결과 밖이면 상세를 비운다 — 다른 키를 자동 선택하지 않는다.
  const pendingSelection = useRef<"filter" | null>(null);
  useEffect(() => {
    const reason = pendingSelection.current;
    pendingSelection.current = null;
    if (reason === "filter" && query.key !== undefined && list.selectedInResult === false) {
      const next: TranslationQuery = { ...query };
      delete next.key;
      delete next.keySurface;
      navigate(translationsHref(slug, routeSurfaceSlug, next), "replace");
    }
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 이동 — 전부 한 판정을 지난다 ────────────────────────────────────────────
  // 확인창에서 버린 draft는 복구 사본에서도 지운다 — 안 지우면 돌아왔을 때 버린 입력이 "restored"로 되살아난다(spec §3.5).
  const discardThen = (proceed: () => void) => () => {
    dispatch({ type: "discard" });
    try { window.sessionStorage.removeItem(storageKey(userId, slug)); } catch { /* 저장소가 막혀 있으면 지울 것도 없다 */ }
    proceed();
  };
  function attempt(intent: EditorIntent, proceed: () => void) {
    const plan = planEditorNavigation({ dirtyLocales: dirty, saving, current: keyId }, intent);
    if (plan.action === "go") proceed();
    else if (plan.action === "confirm" && plan.dialog === "discard") setDialog({ kind: "discard", locales: plan.locales, proceed: discardThen(proceed) });
    else if (plan.action === "confirm") setDialog({ kind: "publish", locales: plan.locales });
  }
  const withQuery = (next: TranslationQuery, surface = view.surface) => translationsHref(slug, surface, next);
  useLeaveGuard(dirty.length > 0, proceed => setDialog({ kind: "discard", locales: dirty, proceed: discardThen(proceed) }));

  /*
    ⚠️ **다음 주소는 낙관값(`view`) 위에 쌓는다** (U3 리뷰 r1) — 트리거가 누른 값으로 먼저 서서 사용자는 응답 전에 다음 축을 고른다.
    서버 prop(`query`)으로 조립하면 첫 선택이 조용히 되돌아간다(POSTMORTEM 2026-09-12 — 이전 쿼리 재제출과 같은 부류).
    ⚠️ **키 선택은 `replace`, 트리·필터·검색은 `push`다** (audit-ux #33 · D2) — 뒤로가기가 키 한 칸씩 거슬러 가면 화면을 떠나는 길이
    사라진다. 키 퍼머링크는 `replace`로도 주소창에 남는다. 필터·트리는 "방금 조건으로 되돌아가기"가 뒤로가기의 쓸모다.
  */
  function selectRow(row: TranslationListRow) {
    const next: TranslationQuery = { ...view.query, key: row.keyId, keySurface: row.surfaceSlug };
    attempt({ kind: "select-key", target: row.keyId }, () => navigate(withQuery(next), "replace", { query: next, keyId: row.keyId }));
  }
  function selectTree(surface: string, ns: string) {
    const next = treeQuery(view.query, ns);
    attempt({ kind: "tree", target: `${surface}/${ns}` }, () => navigate(withQuery(next, surface), "push", { query: next, keyId: undefined, surface }));
  }
  function filter(patch: Partial<TranslationQuery>, kind: "filter" | "search" | "clear" = "filter") {
    const next = kind === "clear" ? clearFilters(view.query) : nextQuery(view.query, patch);
    attempt({ kind }, () => { pendingSelection.current = "filter"; navigate(withQuery(next), "push", { query: next }); });
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
        setRevertedLocales(prev => new Set([...prev].filter(code => !result.cells.some(cell => cell.localeCode === code))));
        setSavedLocales(prev => new Set([...prev, ...result.cells.map(cell => cell.localeCode)]));
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
          : result.error === "key-unavailable" ? { kind: "key-gone" }
          : result.error === "not-ready" ? { kind: "not-ready" }
          : result.error === "cannot-clear" && "localeCodes" in result ? { kind: "cannot-clear", locales: result.localeCodes }
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

  /*
    ⚠️ **Save가 끝나면 착지한다** (audit #32 — 주 흐름). 저장 중 `loading`이 [Save]를 꺼 포커스가 `body`로 빠지고, 성공하면
    저장할 것이 없어 꺼진 채 남는다 — 그때는 결과 줄(Revert 성공과 같은 자리 · DESIGN §7), 거부면 다시 켜진 [Save]다.
    단축키로 저장했으면 포커스가 입력에 그대로라 옮기지 않는다(빠졌을 때만 옮긴다).
  */
  useLandAfter(saving, () => [saveRef.current, resultRef.current]);

  // ── Revert ────────────────────────────────────────────────────────────────
  // 비활성 판정(`revertBlocked`)은 아래 Publish · Sync 뒤에 있다 — 두 진행 상태를 읽는다.
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
        // ⚠️ `router.refresh()`를 부르지 않는다 (audit-ux #12) — `revertTranslationKey`가 `revalidateTranslationReaders`로 새 트리를
        // 싣고 오고, 또 부르면 결과가 선 뒤 두 번째 전체 렌더가 표시 없이 돌았다.
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
  const footerAlertId = useId();
  const [syncOpen, openSyncDialog] = useState(false);
  /*
    ⚠️ **Sync와 Publish는 서로를 잠근다** (audit-ux #2 — DESIGN §6 "진행 중 상호 잠금") — 각 버튼은 자기 연타만 막고 서로의
    존재를 모르므로 판정은 호스트의 몫이다(Home은 `HomeActions`가 든다). ⚠️ **하나의 `busy`로 접지 않는다** — Sync가 자기
    자신을 잠가 `Syncing…` 트리거가 포커스 복귀 대상을 잃는다. ⚠️ **Publish가 도는 동안 확인 창을 "예약"하지 않는다** —
    잠긴 `SyncButton`은 Dialog를 세우지 않으므로, 그때 연 상태가 Publish가 끝나는 순간 혼자 열린다.
  */
  const [syncPending, setSyncPending] = useState(false);
  const setSyncOpen = (open: boolean) => openSyncDialog(open && !publish.pending);
  /**
   * ⚠️ **[Sync]의 원결과를 이 화면이 든다** (audit #5 — POSTMORTEM 2026-09-08 재발) — 전엔 `onResult`가 결과를 버리고
   * refresh만 불러 거부가 설명 없이 버튼만 복귀했다. refresh는 `SyncButton`이 성공에만 부른다.
   */
  const [syncOutcome, setSyncOutcome] = useState<RepositoryImportOutcome | null>(null);
  /** 결과의 [Try again]도 머리의 [Sync]와 같은 미저장 확인을 지난다 — 여는 자리가 둘이면 한쪽이 guard를 빠뜨린다. */
  const openSync = () => { if (!publish.pending && !syncPending) attempt({ kind: "sync" }, () => setSyncOpen(true)); };

  const isPending = (locale: { code: string; pending: boolean }) => (locale.pending || savedLocales.has(locale.code)) && !revertedLocales.has(locale.code);
  const pendingLocales = detail?.locales.filter(isPending).map(l => l.code) ?? [];
  // 사유 문장("…while a save, publish, or sync is running")이 말하는 넷을 그대로 본다 (audit-ux #3) — 전엔 저장·Revert뿐이라 서버의 `busy`로만 멈췄다.
  const revertBlocked: RevertReason | null = role === "EDITOR" ? "forbidden"
    : dirty.length > 0 ? "unsaved"
    : saving || revertBusy || syncPending || publish.pending ? "busy"
    : revertReason;

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
  const treeOverlayId = useId();
  const treeCollapsed = layout !== null && layout.tree === null;

  // ── 머리 ──────────────────────────────────────────────────────────────────
  const surfaceLocales = [...new Set(tree.surfaces.flatMap(s => s.locales))].sort();
  const noKeys = tree.projectKeyCount === 0;
  // 필터 트리거는 누른 값으로 먼저 선다(`view` — audit-ux #7). 목록 제목·빈 상태는 응답이 온 `query`다.
  const shown = view.query;
  const completionLabel = shown.completion === "missing" && shown.missingLocale !== undefined ? w.filters.completion.missingIn(shown.missingLocale)
    : w.filters.completion[shown.completion === "missing" ? "all" : shown.completion];
  const stateLabel = shown.state === undefined ? w.filters.state.any : w.filters.state[shown.state];
  const scopeLabel = w.filters.scope[shown.scope];
  const narrowed = shown.completion !== "all" || shown.state !== undefined || shown.scope !== DEFAULT_TRANSLATION_QUERY.scope;
  const substituted = list.effective.substituted && query.missingLocale !== undefined;

  const listTitle = query.completion === "incomplete" ? w.list.incompleteKeys : w.list.keys;
  const listEmpty = (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-sm">{query.q !== undefined ? w.empty.noMatch(query.q) : noKeys ? w.empty.noActive : w.empty.filteredOut}</p>
      {/* 활성 키가 0이면 좁힌 것이 아니라 아직 온 것이 없다 — 다음 일을 말한다 (audit #31). */}
      {query.q === undefined && noKeys && <p className="text-muted-foreground text-xs">{m.translations.empty.noKeys.description}</p>}
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
              <span onClickCapture={event => { if (dirty.length > 0) { event.preventDefault(); event.stopPropagation(); openSync(); } }}>
                <SyncButton slug={slug} surfaceSlug={routeSurfaceSlug} name={props.sync.name} branch={props.sync.branch} role={role} unsent={props.unpublished}
                  paused={publish.pending} open={syncOpen} onOpenChange={setSyncOpen} onPendingChange={setSyncPending}
                  onResult={setSyncOutcome} fallbackFocusRef={titleRef} />
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
            {/* ⚠️ **Publish 버튼 하나만 가로챈다** — 같은 컨테이너의 `View result`는 결과를 보는 클릭이지 보내는 클릭이 아니다. */}
            <span onClickCapture={event => {
              // 꺼진 Publish(`aria-disabled`)도 클릭 이벤트는 오므로 여기서 걸러야 미저장 확인창이 안 뜬다.
              const onPublish = event.target instanceof Element && event.target.closest(`[id="${publishButtonId}"]:not([aria-disabled="true"])`) !== null;
              if (onPublish && dirty.length > 0 && !publish.pending) { event.preventDefault(); event.stopPropagation(); setDialog({ kind: "publish", locales: dirty }); }
            }}>
              <PublishButton id={publishButtonId} count={props.unpublished} publish={publish} disabled={syncPending} />
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu axis={w.filters.completion.axis} label={completionLabel} on={shown.completion !== "all"} size="md" disabled={noKeys}
            value={shown.completion === "missing" ? `missing:${shown.missingLocale ?? ""}` : shown.completion}
            options={[
              { value: "all", label: w.filters.completion.all },
              { value: "incomplete", label: w.filters.completion.incomplete },
              { value: "complete", label: w.filters.completion.complete },
              ...surfaceLocales.map(code => ({ value: `missing:${code}`, label: w.filters.completion.missingIn(code), group: w.filters.completion.missingMenu })),
            ]}
            onSelect={value => value.startsWith("missing:") ? filter({ completion: "missing", missingLocale: value.slice("missing:".length) }) : filter({ completion: value as TranslationQuery["completion"] })}
          />
          <FilterMenu axis={w.filters.state.axis} label={stateLabel} on={shown.state !== undefined} size="md" disabled={noKeys}
            value={shown.state ?? ""} hint={w.filters.state.newHint}
            options={[
              { value: "", label: w.filters.state.any },
              { value: "unsent", label: w.filters.state.unsent },
              { value: "review", label: w.filters.state.review },
              { value: "new", label: w.filters.state.new },
            ]}
            onSelect={value => filter({ state: value === "" ? undefined : value as TranslationQuery["state"] })}
          />
          <FilterMenu axis={w.filters.scope.axis} label={scopeLabel} on={shown.scope !== "source"} size="md" disabled={noKeys}
            value={shown.scope}
            options={[
              { value: "namespace", label: w.filters.scope.namespace },
              { value: "source", label: w.filters.scope.source },
              { value: "project", label: w.filters.scope.project },
            ]}
            onSelect={value => filter({ scope: value as TranslationQuery["scope"] })}
          />
          {narrowed && <Button variant="ghost" onClick={() => filter({}, "clear")}><RotateCcw aria-hidden />{w.filters.clear}</Button>}
          {noKeys && <span className="text-muted-foreground text-xs">{w.filters.nothingToFilter}</span>}
          <SearchInput className="ml-auto" inputClassName="w-80" value={query.q} label={w.filters.search} onSearch={q => filter({ q: q === "" ? undefined : q }, "search")} />
        </div>
        {substituted && (
          <p className="text-muted-foreground text-xs">{w.filters.substituted(routeSurfaceSlug, query.missingLocale ?? "")}</p>
        )}
        {/*
          ⚠️ **두 배너와 Sync 결과는 조건부 분기 밖의 형제다** (DESIGN §6.1 · POSTMORTEM 2026-09-07) — 분기 안에 두면 `router.refresh()`가 방금 만든
          상태를 언마운트한다. 대기 배너가 먼저다: "왜 지금 보내야 하는가"가 "보내라"보다 앞이다.
        */}
        <div className="space-y-3 empty:hidden">
          <BasePendingBanner baseLocale={props.baseLocale} declaredBaseLocale={props.declaredBaseLocale} />
          <EditLossBanner count={props.unpublished} publishButtonId={publishButtonId} />
          <SyncResult slug={slug} branch={props.sync.branch} outcome={syncOutcome} onDismiss={() => setSyncOutcome(null)}
            retryDisabled={publish.pending} onRetry={role === "OWNER" ? openSync : undefined} />
        </div>
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex h-full min-h-0" style={layout?.scrollWidth ? { minWidth: layout.scrollWidth } : undefined}>
          <div className="border-border bg-background relative flex min-h-0 shrink-0 overflow-hidden rounded-lg border" style={layout ? { width: layout.left } : { width: PANEL.tree + PANEL.list }}>
            {!treeCollapsed && (
              <TreePanel tree={tree} surfaceSlug={view.surface} ns={shown.scope === "namespace" ? shown.ns : ALL_NAMESPACES} onSelect={selectTree}
                className="border-border shrink-0 border-r" width={layout?.tree ?? PANEL.tree} />
            )}
            <KeyList
              list={rows}
              title={listTitle}
              count={list.matchedKeyCount}
              savedExtra={savedOutCount(rows)}
              selectedKeyId={view.keyId}
              showSource={query.scope === "project"}
              onSelect={selectRow}
              onMore={shownList.cursor === null ? null : () => void loadMore()}
              moreLoading={shownList.more === "loading"}
              moreFailed={shownList.more === "failed"}
              busy={navigating}
              treeButton={treeCollapsed ? { open: treeOverlay, controls: treeOverlayId, onToggle: () => setTreeOverlay(v => !v), breadcrumb: <span className="text-muted-foreground text-xs">{routeSurfaceSlug}</span> } : undefined}
              empty={listEmpty}
            />
            {treeCollapsed && treeOverlay && (
              <TreeOverlay id={treeOverlayId} onClose={() => setTreeOverlay(false)}>
                <TreePanel tree={tree} surfaceSlug={view.surface} ns={shown.scope === "namespace" ? shown.ns : ALL_NAMESPACES}
                  // 선택한 항목이 오버레이와 함께 사라지므로 토글로 돌려준다 — 안 하면 이동이 있든 없든 body로 떨어진다(T19 실측).
                  onSelect={(surface, ns) => { focusController(treeOverlayId); setTreeOverlay(false); selectTree(surface, ns); }} />
              </TreeOverlay>
            )}
          </div>
          <ResizeHandle layout={layout} onChange={rememberLeft} />
          <div data-panel="detail" aria-busy={navigating || undefined} className="border-border bg-background flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border">
            {detail === null ? (
              <div className="flex flex-1 items-center justify-center">
                {props.detail !== null && "absent" in props.detail
                  ? <EmptyState icon={Languages} title={w.detail.keyGone(props.detail.surfaceSlug)} />
                  : <EmptyState icon={Languages} title={w.detail.selectKey} description={w.detail.selectKeyBody} />}
              </div>
            ) : (
              <LocalePanel
                detail={{ ...detail, locales: detail.locales.map(l => ({ ...l, pending: isPending(l) })) }}
                draft={draft}
                language={language}
                languageLocked={navigating}
                onLanguage={next => {
                  setLanguage(next);
                  window.history.replaceState(null, "", withQuery(nextQuery(query, { language: next })));
                }}
                onEdit={(code, value) => dispatch({ type: "edit", locale: code, value })}
                onReset={code => dispatch({ type: "reset", locale: code })}
                onSave={() => void save()}
                copyHref={withQuery({ ...DEFAULT_TRANSLATION_QUERY, ns: detail.key.namespace, scope: "namespace", key: detail.key.id, keySurface: detail.key.surfaceSlug }, detail.key.surfaceSlug)}
                readOnly={navigating || status?.kind === "archived" || status?.kind === "lost-access"}
                invalid={status?.kind === "cannot-clear" ? { locales: status.locales, describedBy: footerAlertId } : undefined}
                footer={
                  <Footer
                    alertId={footerAlertId}
                    dirty={dirty.length}
                    status={status}
                    saving={saving}
                    resultRef={resultRef}
                    saveRef={saveRef}
                    hasPending={pendingLocales.length > 0}
                    revertBlocked={revertBlocked}
                    revertBusy={revertBusy}
                    saveDisabled={dirty.length === 0 || status?.kind === "archived" || status?.kind === "lost-access"}
                    onSave={() => void save()}
                    onRevert={() => void openRevert()}
                    onCheck={() => { setStatus(null); router.refresh(); }}
                    slug={slug}
                    storageBlocked={storageBlocked}
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

function Footer({ alertId, dirty, status, saving, resultRef, saveRef, hasPending, revertBlocked, revertBusy, saveDisabled, onSave, onRevert, onCheck, slug, storageBlocked }: {
  alertId: string; dirty: number; status: FooterStatus | null; saving: boolean; resultRef: React.RefObject<HTMLSpanElement | null>; saveRef: React.RefObject<HTMLButtonElement | null>;
  hasPending: boolean; revertBlocked: RevertReason | null; revertBusy: boolean; saveDisabled: boolean;
  onSave: () => void; onRevert: () => void; onCheck: () => void; slug: string; storageBlocked: boolean;
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
        <div id={alertId} className="px-4 pt-3">{ALERTS[status.kind]?.({ onCheck, slug, storageBlocked, status })}</div>
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* ⚠️ 사유는 결과 줄(`aria-live`) 밖의 형제다 — 안에 두면 사유가 바뀔 때마다 결과처럼 다시 낭독된다.
            세로로 묶는 래퍼가 결과 아래에 쌓이는 자리를 지킨다. */}
        <span className="flex min-w-0 flex-col">
          <span ref={resultRef} tabIndex={-1} data-footer-result="true" aria-live="polite"
            className={cn("min-w-0 text-xs focus:outline-none", dirty > 0 ? "text-amber-700" : "text-muted-foreground")}>
            {text}
          </span>
          {hasPending && revertBlocked !== null && <span id={reasonId} className="text-muted-foreground min-w-0 text-xs">{REVERT_REASONS[revertBlocked]()}</span>}
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          {hasPending && (
            // ⚠️ **`loading`을 쓰지 않는다** — 그쪽은 진짜 `disabled`를 걸어 방금 누른 버튼이 포커스를 잃고
            // busy 사유(describedby)에 닿을 길이 사라진다 (DESIGN §6.65). 스피너만 같은 모양으로 직접 둔다.
            <Button aria-disabled={revertBlocked !== null ? "true" : undefined} aria-describedby={revertBlocked !== null ? reasonId : undefined}
              aria-busy={revertBusy || undefined} onClick={() => { if (revertBlocked === null) onRevert(); }}>
              {revertBusy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {w.revert.button}
            </Button>
          )}
          <Button ref={saveRef} variant="primary" loading={saving} disabled={saveDisabled} onClick={onSave}>{w.footer.save}</Button>
        </span>
      </div>
    </div>
  );
}

const ALERTS: Partial<Record<FooterStatus["kind"], (ctx: { onCheck: () => void; slug: string; storageBlocked: boolean; status: FooterStatus }) => ReactNode>> = {
  // 거부 단위는 키 전체다 — 제목이 로케일을, 본문이 "아무것도 저장되지 않았다"를 말한다(delivery-invariants D2).
  "cannot-clear": ({ status }) => status.kind === "cannot-clear" && (
    <Alert variant="danger" title={m.translations.workspace.footer.cannotClear.title(status.locales.join(", "))}>{m.translations.workspace.footer.cannotClear.body}</Alert>
  ),
  "save-failed": () => <Alert variant="danger" title={m.translations.workspace.footer.saveFailed.title}>{m.translations.workspace.footer.saveFailed.body}</Alert>,
  "key-gone": () => <Alert variant="danger" title={m.translations.workspace.footer.saveFailed.title}>{m.translations.workspace.footer.keyGone}</Alert>,
  "not-ready": () => <Alert variant="warning" title={m.translations.workspace.footer.saveFailed.title}>{m.translations.workspace.footer.notReady}</Alert>,
  "save-unknown": () => <Alert variant="danger" title={m.translations.workspace.footer.saveUnknown.title}>{m.translations.workspace.footer.saveUnknown.body}</Alert>,
  // ⚠️ 사본이 없으면 "이 탭에서 다시 로그인"이 입력을 지우는 안내가 된다 — 먼저 복사하라고 말한다 (ARCHITECTURE §6.04).
  session: ({ storageBlocked }) => (
    <Alert variant="danger" title={m.translations.workspace.footer.session.title}>
      {storageBlocked ? m.translations.workspace.footer.session.storageBlocked : m.translations.workspace.footer.session.body}{" "}
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
/** `aria-controls`로 이 id를 가리키는 컨트롤에 포커스를 준다. `useId`의 `:`가 선택자 이스케이프를 요구해 속성값을 직접 비교한다. */
function focusController(id: string): void {
  [...document.querySelectorAll<HTMLElement>("[aria-controls]")].find(node => node.getAttribute("aria-controls") === id)?.focus();
}

/**
 * ⚠️ **열리면 포커스를 안으로 옮긴다** — 이 오버레이는 DOM상 키 목록 **뒤**에 붙어, 그대로 두면 키보드 사용자가 목록 전체를 Tab으로 지나야
 * 트리에 닿는다(T19 실측). ⚠️ **토글로 돌려주는 것은 Escape뿐이다** — 바깥 클릭은 사용자가 누른 곳이 포커스를 가져야 한다.
 * ⚠️ **돌아갈 곳을 마운트 때의 `activeElement`로 잡지 않는다** — dev StrictMode가 이펙트를 두 번 돌려 둘째 실행이 이미 포커스를 받은
 * 트리 항목을 잡았고, Escape가 곧 사라질 그 항목에 포커스를 줘 body로 떨어졌다(T19 실측). `aria-controls`로 이 오버레이를 가리키는 토글이 정본이다.
 */
function TreeOverlay({ id, onClose, children }: { id: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (ref.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? ref.current?.querySelector<HTMLElement>("button"))?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
      focusController(id);
    };
    const outside = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose(); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, [id, onClose]);
  return (
    <div ref={ref} id={id} className="border-border bg-popover shadow-medium absolute top-14 left-3 z-20 flex max-h-80 w-70 flex-col overflow-hidden rounded-lg border">
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
  // 트리가 접혀 범위가 한 점이면 ←→가 아무것도 안 한다 — Tab이 들르면 죽은 정거장이다.
  const fixed = layout !== null && layout.bounds.min === layout.bounds.max;
  // ⚠️ pointerup만 끝내면 pointercancel·캡처 상실 뒤 drag가 남아, 버튼 없이 지나가는 포인터가 폭을 바꾸고 저장한다.
  const endDrag = () => { setDrag(null); setValue(null); };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={m.translations.workspace.resize}
      aria-valuenow={Math.round(current)}
      aria-valuemin={layout?.bounds.min}
      aria-valuemax={layout?.bounds.max}
      aria-disabled={fixed || undefined}
      tabIndex={fixed ? -1 : 0}
      data-state={drag !== null ? "drag" : undefined}
      onKeyDown={event => {
        if (layout === null) return;
        const next = stepPanelWidth(layout.left, event.key, layout.bounds);
        if (next === null) return;
        event.preventDefault();
        onChange(next);
      }}
      onPointerDown={event => {
        if (layout === null || fixed) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDrag({ start: event.clientX, origin: layout.left });
      }}
      onPointerMove={event => {
        if (drag === null || layout === null) return;
        const next = Math.min(layout.bounds.max, Math.max(layout.bounds.min, drag.origin + event.clientX - drag.start));
        setValue(next);
        onChange(next);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      className={cn(
        "group relative w-4 shrink-0 focus-visible:outline-none",
        !fixed && "cursor-col-resize",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 after:bg-gradient-to-b after:from-transparent after:via-ring after:to-transparent",
        "after:opacity-0 hover:after:opacity-100 focus-visible:after:opacity-100 data-[state=drag]:after:opacity-100",
      )}
    />
  );
}
