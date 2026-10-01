"use client";

import { ArrowDownToLine, Languages, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useOptimistic, useReducer, useRef, useState, useTransition, type ReactNode } from "react";

import { previewTranslationRevert, revertTranslationKey, saveTranslationKey } from "@/app/(edit)/actions";
import { useCommitWait } from "@/components/commit-wait";
import { PublishButton, PublishModal, usePublish } from "@/components/publish-button";
import { SearchInput } from "@/components/search-input";
import { SyncButton } from "@/components/home/sync-button";
import { SyncLockBanner, SyncLockDialog } from "@/components/translations/sync-lock";
import { BasePendingBanner } from "@/components/translations/base-pending-banner";
import { EditLossBanner } from "@/components/translations/edit-loss-banner";
import { Alert } from "@/components/ui/alert";
import { CountBadge } from "@/components/ui/count-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useLandAfter, useLandAfterCommit } from "@/components/ui/focus";
import { useArrived } from "@/components/use-arrived";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { planActionAvailability } from "@/lib/home/state";
import { connectionReason } from "@/lib/translations/connection-reason";
import { importRevalidates, type RepositoryImportOutcome } from "@/lib/import/result";
import type { TranslationList, TranslationListRow, TranslationTree } from "@/lib/keys/translation-list";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { dirtyLocales, initKeyDraft, planDraftRecovery, reduceKeyDraft, type KeyDraftAction, type KeyDraftState } from "@/lib/translations/draft";
import { planTranslationPanelLayout, stepPanelWidth, PANEL } from "@/lib/translations/layout";
import { planEditorNavigation, type EditorIntent } from "@/lib/translations/navigation";
import {
  ALL_NAMESPACES, allSourcesQuery, applyEmptyAction, DEFAULT_TRANSLATION_QUERY, emptyActions, FIRST_KEY, isAllSources, listGenerationKey, nextQuery,
  searchQuery, selectQuery, statusOf, STATUSES, translationsHref, treeQuery, withStatus, type EmptyAction, type Status, type TranslationQuery,
} from "@/lib/translations/query";
import { applySavedRow, mergeServerRows, savedOutCount, startListGeneration, type ListGeneration } from "@/lib/translations/saved-rows";
import { countTree, type NodeCount } from "@/lib/translations/tree-narrow";
import { summarizeKey } from "@/lib/translations/summary";
import { cn } from "@/lib/utils";

import { FilterMenu } from "./filter-menu";
import { KeyList } from "./key-list";
import { LocalePanel, LocalePanelSkeleton, type DetailView } from "./locale-panel";
import { TreePanel } from "./tree-panel";
import { useLeaveGuard } from "./use-leave-guard";

/**
 * **번역 작업 화면의 유일한 소유자** (translation-rework T13–T15 — spec §3 · design §6).
 *
 * draft · 목록 세대 · 이동 확인 · Save/Revert 결과가 **한 곳**에 산다. 트리·Status·검색·`All sources`·키 선택·셸 밖 이동·뒤로/앞으로가 전부
 * `planEditorNavigation` 하나를 지난다 — 이동 진입점마다 판정을 따로 두면 하나가 guard를 빠뜨린다(POSTMORTEM 2026-09-12 — 툴바만 잠금).
 *
 * **트리 = 목록 범위, 필터는 Status 하나, 검색은 전 소스다** (translation-tree-range — 2026-10-01 사용자). 트리·키 선택은 Status·검색어를 바꾸지 않는다.
 *
 * ⚠️ **draft는 재검증으로 언마운트되지 않는다** — 같은 키의 서버 값은 `server` 액션으로 받고(미저장 입력 보존), 키가 바뀔 때만 새로 시작한다.
 * ⚠️ **결과 영역은 조건부 분기 밖이다** — `revalidatePath`가 방금 받은 결과를 언마운트하면 안 된다(ARCHITECTURE §0 불변식 9).
 */
export type WorkspaceProps = {
  slug: string;
  /** 경로의 소스 — 트리 위치의 소스. 전 소스 검색의 다른 소스 결과는 `query.keySurface`가 상세의 소스를 정한다. */
  routeSurfaceSlug: string;
  role: "OWNER" | "EDITOR";
  userId: string;
  query: TranslationQuery;
  tree: TranslationTree;
  /** 범위로 자른 목록 — 서버가 전 소스를 한 번 읽고 자른다(design §3). */
  list: TranslationList;
  /** 조건(Status·검색)이 켜졌을 때 전 소스 행의 노드별 일치 수, 아니면 `null` — 트리 숫자다(그 노드를 눌렀을 때의 목록 수). */
  counts: readonly NodeCount[] | null;
  /** `null`은 선택 없음, `absent`는 URL의 키가 사라졌다(부재 안내 — 다른 키로 바꾸지 않는다). */
  detail: DetailView | { absent: true; surfaceSlug: string } | null;
  unpublished: number;
  publish: { repo: { owner: string; name: string; branch: string; syncBranch: string }; lastSentLabel: string | null; lastPrUrl: string | null };
  sync: { name: string; branch: string };
  /** 기준 로케일의 **현실**과 **선언** — 대기 배너의 조건이다 (6b-3, `basePending`). 옛 헤더에서 옮겨 왔다. */
  baseLocale: string | null;
  declaredBaseLocale: string | null;
  /**
   * 연결 판정 (ux-drift-unify §3.3 · 🔴 F) — `status`는 첫 렌더의 DB 판정(`storedConnection` — `not-connected`·`unpinned`, 아니면 `unknown`),
   * `later`는 GitHub 판정의 promise다(App 제거 · 설치 교체 · 리포 교체). 도착하면 그것이 이긴다. ⚠️ **`unknown`은 버튼을 끄지 않는다.**
   */
  connection: { status: ConnectionHealth["status"]; later?: Promise<ConnectionHealth> };
  /**
   * 착지 시점의 적재 lease (sync-lock R1) — 서버가 `planWriteLock`으로 판정해 시각만 넘긴다(토큰 없음). 헤더 배너와 OWNER [Sync]의 사유만 읽는다.
   * ⚠️ **행(`KeyRow`)까지 내리지 않는다** — lease 하나로 5,000행 memo가 깨진다(POSTMORTEM 2026-10-01). ⚠️ Save를 끄지 않는다 — 막는 것은 서버 거부다.
   */
  writeLock: { startedAt: Date; reopensBy: Date } | null;
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

/**
 * **재마운트 착지 표식** (translation-tree-range design §4.4 · POSTMORTEM 2026-09-24) — 다른 소스로의 이동(트리 클릭 · 전 소스 결과의 다른 소스 키 ·
 * 검색 딥링크의 검색 지우기)은 `surfaces/[surfaceSlug]` 세그먼트가 바뀌어 화면이 재마운트되고, 누른 컨트롤이 사라져 포커스가 `body`로 빠진다.
 * ⚠️ **모듈 변수 한 칸이다(sessionStorage가 아니다)** — 착지는 같은 탭 SPA 이동에서만 의미가 있다. 이동 확인을 지난 `proceed` 안에서, 경로 소스가
 * 바뀌는 이동일 때만 쓴다(취소된 이동은 표식을 남기지 않는다). 마운트가 한 번 읽고 지우며, 표식의 소스가 마운트한 경로와 같을 때만 포커스를 옮긴다
 * (다르면 — 세션 만료 → 로그인 왕복 등 — 버린다). 새로고침·뒤로가기·딥링크는 표식이 없어 스크롤만 한다.
 */
type Landing = { surfaceSlug: string; at: number; target: { kind: "tree"; ns: string } | { kind: "row"; keyId: string } | { kind: "search" } };
let landing: Landing | null = null;
/**
 * ⚠️ **표식은 만료된다** — 목적지가 워크스페이스를 그리지 않으면(ProjectNotReady · 오류 경계) 아무도 지우지 않아, 나중에 같은 소스를 따로 열 때 포커스를
 * 뺏는다. 서버 렌더 한 번(실측 ~1–3초)을 넉넉히 덮는 값이다. 이동마다 지우는 형은 쓸 수 없다 — 셸 링크 이동은 이 화면을 지나지 않는다.
 */
const LANDING_TTL_MS = 15_000;
const landingFor = (surfaceSlug: string, target: Landing["target"]): Landing => ({ surfaceSlug, at: Date.now(), target });
const landsHere = (mark: Landing | null | undefined, routeSurfaceSlug: string) =>
  mark !== null && mark !== undefined && mark.surfaceSlug === routeSurfaceSlug && Date.now() - mark.at <= LANDING_TTL_MS;

const STATUS_LABEL = {
  all: () => m.translations.workspace.filters.state.any,
  incomplete: () => m.translations.workspace.filters.state.incomplete,
  review: () => m.translations.workspace.filters.state.review,
  unsent: () => m.translations.workspace.filters.state.unsent,
  new: () => m.translations.workspace.filters.state.new,
} as const satisfies Record<Status, () => string>;

const storageKey = (userId: string, slug: string) => `malmoi.translation-draft.${userId}.${slug}`;
const widthKey = (userId: string, slug: string) => `malmoi.translation-panels.${userId}.${slug}`;

export function TranslationWorkspace(props: WorkspaceProps) {
  const { slug, routeSurfaceSlug, role, userId, tree, list } = props;
  const router = useRouter();
  /*
    재마운트 착지 표식을 마운트 렌더에서 **읽기만** 한다 — 지우는 것은 착지 effect다. 렌더에서 지우면 dev StrictMode의 두 번째 렌더가 빈 표식을 읽는다.
    ⚠️ 앱 안 소스 전환으로 도착했으면 세션 복구 문구를 띄우지 않는다(malmoi#100) — 그 문구는 다시 로그인한 탭의 첫 키를 위한 것이다.
  */
  const arrival = useRef<Landing | null | undefined>(undefined);
  if (arrival.current === undefined) arrival.current = landing;
  const arrivedInApp = landsHere(arrival.current, routeSurfaceSlug);
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
  /*
    ⚠️ **복구 문구는 그것이 말하는 미저장보다 오래 살지 않는다** (malmoi#100) — 되돌려 0이 되면 지운다. effect로 가장자리를 보면
    복구 자신의 첫 커밋(아직 0)에 지워지므로, 편집이 만드는 다음 상태로 판정한다.
  */
  function edit(action: KeyDraftAction) {
    dispatch(action);
    if (status?.kind === "restored" && dirtyLocales(reduceKeyDraft(draft, action)).length === 0) setStatus(null);
  }

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
  /*
    ⚠️ **잠금은 새 서버 트리까지 간다** (malmoi#103) — Action이 풀린 뒤 재검증 트리가 0.3–1.5 s 늦게 커밋되는 동안 Sync·Publish·Revert가
    옛 상세·건수로 켜졌다. 신호는 **상세, 없으면 목록**이다 — 둘 다 서버가 렌더할 때마다 새 객체가 되고, 상세는 키를 고르지 않으면 `null`이다.
  */
  const server = props.detail ?? props.list;
  const revertCommit = useCommitWait(server);
  const [revertRunning, setRevertBusy] = useState(false);
  const revertBusy = revertRunning || revertCommit.waiting;
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
    /*
      ⚠️ **세션 문구는 이 화면이 처음 여는 키의 복구에만 쓴다** (malmoi#100) — 다시 로그인한 뒤 연 탭이 그 갈래다. 같은 화면 안에서
      보호 없이 교체된 키로 돌아올 때의 복구(backstop)는 로그인과 무관하고, 미저장 수가 이미 그 사실을 말한다.
    */
    const first = restoredFor.current === null && !arrivedInApp;
    restoredFor.current = keyId;
    try {
      const raw = window.sessionStorage.getItem(storageKey(userId, slug));
      if (raw === null) return;
      const copy = JSON.parse(raw) as { surfaceSlug?: unknown; keyId?: unknown; saved?: unknown; draft?: unknown };
      if (copy.keyId !== keyId || copy.surfaceSlug !== detailSurface || typeof copy.draft !== "object" || copy.draft === null || typeof copy.saved !== "object" || copy.saved === null) return;
      const saved = copy.saved as Record<string, unknown>;
      // ⚠️ 언어 구성은 돌아온 키의 상세로 잰다 — 이 커밋의 `draft`는 아직 거쳐 간 키의 것이라 그 키에 없던 언어를 건너뛴다(감사 #10).
      const locales = valuesOf(detail);
      let count = 0;
      for (const [code, value] of Object.entries(copy.draft as Record<string, unknown>)) {
        if (typeof value !== "string" || !Object.hasOwn(locales, code) || value === saved[code]) continue;
        dispatch({ type: "edit", locale: code, value });
        count += 1;
      }
      if (count > 0 && first) setStatus({ kind: "restored", count });
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
    ⚠️ **서버 목록은 전량이다** (translation-filter-scope) — 같은 세대의 재검증에서 서버 행에 없는 행은 곧 조건 이탈이라 `savedOut`이 된다.
  */
  // ⚠️ 세대 키는 전 소스 범위에서 위치를 보지 않는다(`listGenerationKey`) — 같은 소스의 다른 네임스페이스 키를 골라도 목록이 새로 서지 않는다(#157).
  const conditionKey = listGenerationKey(query, routeSurfaceSlug);
  type ListState = { source: typeof list; key: string; rows: ListGeneration<TranslationListRow> };
  const [listState, setListState] = useState<ListState>(() => ({ source: list, key: conditionKey, rows: startListGeneration(list.rows, 0) }));
  /*
    ⚠️ **Sync 성공은 새 세대다** (감사 #11) — 같은 조건의 재검증은 행을 끼워 넣지 않으므로, 들여온 키가 목록에 영영 안 섰다(처음 목록이
    비었으면 계속 비었다). 기준은 **Sync를 시작한 순간의 목록**이다 — 결과와 새 트리 중 어느 쪽이 먼저 커밋돼도 그 뒤에 온 목록에서 시작한다.
  */
  const syncListFrom = useRef<typeof list | null>(null);
  const [resync, setResync] = useState<{ from: typeof list } | null>(null);
  const resyncDue = resync !== null && resync.from !== list;
  let shownList = listState;
  if (listState.source !== list || resyncDue) {
    if (resyncDue) setResync(null);
    if (listState.key !== conditionKey || resyncDue) {
      shownList = { source: list, key: conditionKey, rows: startListGeneration(list.rows, listState.rows.generation + 1) };
    } else {
      shownList = { ...listState, source: list, rows: mergeServerRows(listState.rows, list.rows) };
    }
    setListState(shownList);
  }
  const rows = shownList.rows;
  const setRows = (update: (prev: ListGeneration<TranslationListRow>) => ListGeneration<TranslationListRow>) => setListState(prev => ({ ...prev, rows: update(prev.rows) }));

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

  /*
    ⚠️ **선택 행으로 스크롤하는 것은 착지뿐이다** (translation-filter-scope design §3.2) — 마운트(딥링크·새로고침·다른 소스로의 이동은 재마운트다),
    트리 이동의 도착, 검색 지우기의 도착(조건 8 — 범위가 고른 키의 위치로 돌아간다). 목록에서 직접 누른 행은 이미 보이는 행이라 스크롤하지 않는다.
    포커스는 재마운트 착지(아래)만 옮긴다.
    대기 중에는 기다린다 — 트리 이동의 선택은 응답이 고른 첫 키다. 확인창에서 취소한 트리 이동은 표식을 세우지 않는다.
  */
  const scrollPending = useRef(true);
  useEffect(() => {
    if (!scrollPending.current || navigating) return;
    scrollPending.current = false;
    if (keyId === undefined) return;
    [...(bodyRef.current?.querySelectorAll<HTMLElement>("[data-key-row]") ?? [])].find(el => el.dataset.keyRow === keyId)?.scrollIntoView({ block: "nearest" });
  });

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
    // 전 소스 범위면 위치를 그 키의 소스·네임스페이스로 맞춘다(조건 7) — 다른 소스면 경로가 바뀌어 재마운트된다(착지는 그 행).
    const { query: next, surfaceSlug } = selectQuery(view.query, row);
    const surface = surfaceSlug ?? view.surface;
    attempt({ kind: "select-key", target: row.keyId }, () => {
      if (surface !== routeSurfaceSlug) landing = landingFor(surface, { kind: "row", keyId: row.keyId });
      navigate(withQuery(next, surface), "replace", { query: next, keyId: row.keyId, surface });
    });
  }
  /*
    ⚠️ **목록 행에 넘기는 선택 함수는 렌더마다 같다** — 행이 `memo`라(`key-list.tsx`) 새 함수를 넘기면 타이핑마다 전 행이 다시 렌더된다.
    호출 시점엔 최신 `selectRow`(최신 `view`·draft)를 부른다 — 클릭은 커밋 뒤에 오므로 layout effect가 이미 갱신했다.
  */
  const selectRowRef = useRef(selectRow);
  useLayoutEffect(() => { selectRowRef.current = selectRow; });
  const onSelectRow = useCallback((row: TranslationListRow) => selectRowRef.current(row), []);
  /** 트리 클릭 = 그 노드가 목록 범위다(조건 1). Status·검색어는 그대로 — 검색 중이면 결과를 그 노드로 좁힌다(조건 6). */
  function selectTree(surface: string, ns: string) {
    const next = treeQuery(view.query, ns);
    attempt({ kind: "tree", target: `${surface}/${ns}` }, () => {
      scrollPending.current = true;
      if (surface !== routeSurfaceSlug) landing = landingFor(surface, { kind: "tree", ns });
      navigate(withQuery(next, surface), "push", { query: next, keyId: undefined, surface });
    });
  }
  function go(next: TranslationQuery, kind: "filter" | "search" | "clear", surface = view.surface, before?: () => void) {
    attempt({ kind }, () => {
      before?.();
      pendingSelection.current = "filter";
      // 검색 지우기가 위치로 돌아가면 고른 키로 스크롤한다(조건 8). 다른 소스면 재마운트라 검색 입력으로 착지한다(조건 14).
      if (next.q === undefined && view.query.q !== undefined) scrollPending.current = true;
      if (kind === "search" && surface !== routeSurfaceSlug) landing = landingFor(surface, { kind: "search" });
      navigate(withQuery(next, surface), "push", { query: next, surface });
    });
  }
  /**
   * 검색을 지워 위치로 돌아갈 때 **선택 키가 그 위치 밖이면 키의 위치로 간다** — 검색 딥링크(`keySurface ≠ 경로`)가 그 갈래다. 전 소스 결과에서 고른 키는
   * 선택이 이미 위치를 옮겨 두었으므로 그대로다. 서버도 같은 보정으로 redirect하지만(page.tsx) 왕복을 하나 더 만들지 않는다.
   */
  function relocate(next: TranslationQuery): { next: TranslationQuery; surface: string } {
    if (detail === null || detail.key.id !== view.keyId) return { next, surface: view.surface };
    const inside = detail.key.surfaceSlug === view.surface && (next.ns === ALL_NAMESPACES || detail.key.namespace === next.ns);
    return inside ? { next, surface: view.surface } : { next: searchQuery({ ...next, ns: detail.key.namespace }, undefined), surface: detail.key.surfaceSlug };
  }
  function search(text: string) {
    const next = searchQuery(view.query, text);
    const moved = next.q === undefined && view.query.q !== undefined ? relocate(next) : { next, surface: view.surface };
    go(moved.next, "search", moved.surface);
  }
  const [emptyPressed, setEmptyPressed] = useState<"primary" | "secondary" | null>(null);
  const listTitleRef = useRef<HTMLHeadingElement>(null);
  function runEmpty(slot: "primary" | "secondary", action: EmptyAction) {
    // 목적지는 누른 순간의 낙관값 위에 쌓는다(POSTMORTEM 2026-09-12) — 표시에 쓴 서버 쿼리가 아니다.
    const next = applyEmptyAction(action.kind, view.query);
    const moved = action.kind === "clear-search" ? relocate(next) : { next, surface: view.surface };
    go(moved.next, action.kind === "clear-search" ? "search" : action.kind === "clear-filters" ? "clear" : "filter", moved.surface, () => setEmptyPressed(slot));
  }
  // ⚠️ 커밋 동기 착지다 — 누른 빈 상태 버튼이 도착 커밋에서 사라지므로, passive 착지면 전량 목록이 칠해지는 동안 포커스가 body였다(malmoi#158).
  useLandAfterCommit(navigating && emptyPressed !== null, () => listTitleRef.current);
  useEffect(() => { if (!navigating && emptyPressed !== null) setEmptyPressed(null); });

  // ── Save ──────────────────────────────────────────────────────────────────
  /** 쓰기 거부(`sync-running`)의 다시 열리는 시각 — 값이 있으면 Syncing… Dialog가 선다(저장·Revert 공용 — R4). */
  const [syncLock, setSyncLock] = useState<Date | null>(null);
  async function save() {
    // Publish가 도는 동안은 잠긴다 (audit-ux #10 · D3) — Action이 순서대로 실행돼 PR 생성 뒤에 줄을 선다. 단축키도 이 문을 지난다.
    if (detail === null || savingRef.current || dirty.length === 0 || publish.pending) return;
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
        /*
          ⚠️ **`sync-running`은 푸터 Alert가 아니라 Dialog다** (sync-lock S4) — 아래 연쇄의 끝(`save-failed`)으로 떨어지면 "다시 해 보라"가 되는데,
          다시 눌러도 lease가 끝날 때까지 같은 거부다. 상태 줄은 비운다.
        */
        if (result.error === "sync-running") { setSyncLock(result.reopensBy); return; }
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
      // R4 — lease 거부는 저장 거부와 같은 Dialog다. `unavailable`로 접지 않는다(사유가 남아 lease가 끝난 뒤에도 Revert를 막는다).
      else if (preview.status === "blocked" && preview.reason === "sync-running") setSyncLock(preview.reopensBy);
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
        revertCommit.wait();
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
      } else if (result.status === "blocked" && result.reason === "sync-running") {
        setSyncLock(result.reopensBy);
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
  const publish = usePublish(slug, server);
  const syncReasonId = useId();
  const publishButtonId = useId();
  const footerAlertId = useId();
  const [syncOpen, openSyncDialog] = useState(false);
  /*
    ⚠️ **Sync와 Publish는 서로를 잠근다** (audit-ux #2 — DESIGN §6 "진행 중 상호 잠금") — 각 버튼은 자기 연타만 막고 서로의
    존재를 모르므로 판정은 호스트의 몫이다(Home은 `HomeActions`가 든다). ⚠️ **하나의 `busy`로 접지 않는다** — Sync가 자기
    자신을 잠가 도는 [Sync] 트리거가 포커스 복귀 대상을 잃는다. ⚠️ **Publish가 도는 동안 확인 창을 "예약"하지 않는다** —
    잠긴 `SyncButton`은 Dialog를 세우지 않으므로, 그때 연 상태가 Publish가 끝나는 순간 혼자 열린다.
  */
  const syncCommit = useCommitWait(server);
  const [syncRunning, setSyncRunning] = useState(false);
  const setSyncPending = (pending: boolean) => { if (pending) syncListFrom.current = list; setSyncRunning(pending); };
  const syncPending = syncRunning || syncCommit.waiting;
  // 새 트리가 대기 상한(`COMMIT_WAIT_MS`) 안에 안 왔다 — 남은 `resync`가 다음 저장의 재검증을 새 세대로 만들지 않게 버린다(감사 #11 r1).
  // 결과가 먼저면 `wait()`가 같은 배치에 서고 트리가 먼저면 `resyncDue`가 같은 렌더에 풀므로, 이 조건은 상한이 지난 뒤에만 참이다.
  useEffect(() => { if (!syncPending && resync !== null && resync.from === list) setResync(null); }, [syncPending, resync, list]);
  const setSyncOpen = (open: boolean) => openSyncDialog(open && !publish.pending);
  /**
   * **[Sync]의 결과가 왔다** — 표시는 Sync Dialog가 든다(sync-lock S5 — 이 화면의 결과 띠를 걷었다). 여기서는 교차 잠금과 목록 세대만 잇는다.
   * Action의 재검증이 새 트리를 싣고 오고, **응답을 잃은 실행(`unconfirmed`)만** `SyncButton`이 refresh로 트리를 부른다(malmoi#132).
   * 트리를 싣고 오는 결과만 새 트리를 기다린다 — `try` 안의 거부(`reconfirm`…)도 온다 (`importRevalidates`, malmoi#103 r1).
   * ⚠️ **`unconfirmed`도 새 세대다** (malmoi#132 r1) — 서버가 끝냈다면 refresh 트리에 Sync가 들여온 키가 있고, 병합하면 끼워 넣지 않아
   * 목록에 안 선다(감사 #11). 끝내지 않았으면 트리가 같아 새 세대가 곧 병합과 같은 목록이다. 트리가 안 오면(오프라인) 위 effect가 상한 뒤 버린다.
   */
  const onSyncResult = (next: RepositoryImportOutcome) => {
    if (importRevalidates(next)) syncCommit.wait();
    const replaced = next.ok || next.error === "unconfirmed";
    if (replaced && syncListFrom.current !== null) setResync({ from: syncListFrom.current });
  };
  /*
    **끊기면 Sync·Publish가 함께 꺼진다** — Home 머리와 같은 판정(`planActionAvailability`)이다(🔴 F · #52 재발 경로). 보관은 이 화면에 오지 않는다
    (`ProjectArchived`가 대신 선다). 스트리밍으로 도착한 GitHub 판정이 첫 렌더의 DB 판정을 이긴다.
  */
  // ⚠️ effect 구독이다(`useArrived`) — `use()`로 받으면 키 선택·필터·저장 뒤 재검증 전환이 GitHub probe를 기다렸다(U7 r1). 새 판정이 올 때까지 마지막 값을 든다.
  // 식별 키는 프로젝트 · 경로 소스다 — 옮겨도 이 화면이 마운트된 채 남으면 옛 소스의 판정이 새 조회까지 버튼을 붙잡았다(U7 r2).
  const arrived = useArrived(props.connection.later, `${slug}/${routeSurfaceSlug}`)?.status ?? null;
  const availability = planActionAvailability({ archived: false, connection: arrived ?? props.connection.status });
  // 꺼진 원인 문장 (malmoi#160) — 이 화면엔 Home의 연결 배너가 없어서 Publish·Sync 사유와 보류 배너가 원인·해법을 직접 말한다.
  const connectionBlock = availability.publish ? null : connectionReason(arrived ?? props.connection.status, role);
  /**
   * [Sync]를 열 수 있나 — 연결과 착지 lease 둘이다. ⚠️ **미저장 가로채기와 `openSync`가 이 한 값을 본다** (U 리뷰 🔴) — 가로채기가 연결만 보던 때
   * lease로 멈춘 [Sync]를 누르면 "Discard your changes?"가 서고, 확정하면 초안이 버려진 채 Sync Dialog는 열리지 않았다.
   */
  const syncAvailable = availability.sync && props.writeLock === null;
  /** 미저장 확인을 지나 Sync Dialog를 연다 — 여는 자리가 둘이면 한쪽이 guard를 빠뜨린다. */
  const openSync = () => { if (syncAvailable && !publish.pending && !syncPending) attempt({ kind: "sync" }, () => setSyncOpen(true)); };

  const isPending = (locale: { code: string; pending: boolean }) => (locale.pending || savedLocales.has(locale.code)) && !revertedLocales.has(locale.code);
  const pendingLocales = detail?.locales.filter(isPending).map(l => l.code) ?? [];
  // 사유 문장("…while a save, publish, or sync is running")이 말하는 넷을 그대로 본다 (audit-ux #3) — 전엔 저장·Revert뿐이라 서버의 `busy`로만 멈췄다.
  const revertBlocked: RevertReason | null = role === "EDITOR" ? "forbidden"
    : dirty.length > 0 ? "unsaved"
    : saving || revertBusy || syncPending || publish.pending ? "busy"
    : revertReason;

  // ── 폭 ────────────────────────────────────────────────────────────────────
  const bodyRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
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
  const noKeys = tree.projectKeyCount === 0;
  // 필터 트리거·트리 강조는 누른 값으로 먼저 선다(`view` — audit-ux #7). 목록 제목·빈 상태는 응답이 온 `query`다.
  const shown = view.query;
  const shownStatus = statusOf(shown);

  /*
    ⚠️ **빈 상태의 버튼은 표 하나(`emptyActions`)가 정한다** (translation-tree-range design §2.1) — 검색이 위치로 좁혀졌으면 먼저 범위를 넓히라고(`Search
    all sources`), 전 소스면 검색을 지우라고 말한다. `Clear filters`는 Status가 켜졌을 때만이다. 누른 버튼은 도착까지 `busy`(포커스를 지킨다)이고,
    도착하면 목록 제목으로 착지한다 — 빈 상태가 사라지면서 포커스가 `body`로 빠지지 않게(POSTMORTEM 2026-09-24).
    ⚠️ **표시는 서버 `query`(빈 문구와 같은 기준), 목적지는 누른 순간의 낙관값이다**(`runEmpty`) — 표시까지 낙관값으로 고르면 누른 버튼이 대기 중에
    사라지고 포커스가 `body`로 빠졌다(TFS r2).
  */
  const empty = emptyActions(query, { noKeys });
  const emptyButton = (slot: "primary" | "secondary", action: EmptyAction | null) => action !== null && (
    <Button size="sm" variant={slot === "primary" ? "default" : "ghost"} busy={navigating && emptyPressed === slot} onClick={() => runEmpty(slot, action)}>
      {action.kind === "clear-filters" ? <><RotateCcw aria-hidden />{w.filters.clear}</> : w.empty[action.label === "searchAll" ? "searchAll" : "clearSearch"]}
    </Button>
  );
  const emptyText = query.q !== undefined ? w.empty.noMatch(query.q)
    : noKeys ? w.empty.noActive
    : statusOf(query) !== "all" ? w.empty.filteredOut
    : w.empty.noKeys(query.ns === ALL_NAMESPACES ? routeSurfaceSlug : query.ns);
  const listEmpty = (
    <div data-list-empty="" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-sm">{emptyText}</p>
      {/* 활성 키가 0이면 좁힌 것이 아니라 아직 온 것이 없다 — 다음 일을 말한다 (audit #31). */}
      {query.q === undefined && noKeys && <p className="text-muted-foreground text-xs">{m.translations.empty.noKeys.description}</p>}
      {(empty.primary !== null || empty.secondary !== null) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {emptyButton("primary", empty.primary)}
          {emptyButton("secondary", empty.secondary)}
        </div>
      )}
    </div>
  );

  /*
    ⚠️ **트리는 노드를 숨기지 않는다 — 숫자만 일치 수다** (design §4.3). 수는 서버가 전 소스 행에서 센다(`counts`) — 범위 밖 노드도 그 노드를 눌렀을 때의
    목록 수다. 머리 배지·`Filter namespaces` 임계·`showSource`는 원본 트리다.
    `All sources` 노드는 검색 중이고 활성 소스가 둘 이상일 때만 선다 — 하나면 그 소스의 `All namespaces`가 전 소스 범위의 표시를 든다.
  */
  const treeNodes = useMemo(() => countTree(tree, props.counts), [tree, props.counts]);
  const rangeAll = isAllSources(shown);
  // ⚠️ 응답이 오기 전(누른 검색·Status가 서버 조건과 다를 때)에는 숫자를 비운다 — 서버의 일치 수가 없어 전체 키 수를 일치 수처럼 말하게 된다.
  const countsCurrent = props.counts !== null && query.q === shown.q && statusOf(query) === statusOf(shown);
  const allSourcesNode = shown.q !== undefined && tree.surfaces.length > 1
    ? { count: countsCurrent ? props.counts!.reduce((sum, node) => sum + node.count, 0) : null }
    : null;
  const selectAllSources = () => go(allSourcesQuery(view.query), "filter");
  // 접힌 레이아웃에서 범위를 말하는 유일한 단서다 — 범위 콤보가 없다(design §4.5).
  const rangeLabel = rangeAll ? w.tree.allSources : shown.ns === ALL_NAMESPACES ? view.surface : `${view.surface} / ${shown.ns}`;

  // ── 재마운트 착지 (design §4.4) ───────────────────────────────────────────────
  const treeLanded = useRef<HTMLElement | null>(null);
  const treeToggle = () => bodyRef.current?.querySelector<HTMLElement>(`[data-panel="list"] button[aria-label="${w.tree.open}"]`) ?? null;
  // ⚠️ **layout 단계에서 착지한다** (malmoi#158과 같은 이유) — passive effect면 전량 목록이 칠해지는 동안 포커스가 `body`인 프레임이 선다.
  useLayoutEffect(() => {
    const mark = arrival.current;
    if (landing === mark) landing = null;
    if (!landsHere(mark, routeSurfaceSlug) || mark === null || mark === undefined) return;
    const { target } = mark;
    if (target.kind === "row") [...(bodyRef.current?.querySelectorAll<HTMLElement>("[data-key-row]") ?? [])].find(el => el.dataset.keyRow === target.keyId)?.focus();
    else if (target.kind === "search") toolbarRef.current?.querySelector<HTMLElement>("input[type=\"search\"]")?.focus();
    else {
      const node = [...(bodyRef.current?.querySelectorAll<HTMLElement>("[data-tree-ns]") ?? [])].find(el => el.dataset.treeSurface === routeSurfaceSlug && el.dataset.treeNs === target.ns);
      // 트리가 접힌 레이아웃이면 노드가 없다 — 트리 열기 버튼이 그 자리다.
      if (node === undefined) treeToggle()?.focus();
      else { node.focus(); treeLanded.current = node; }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /*
    ⚠️ **착지한 트리 노드가 폭 측정으로 사라지면 트리 열기 버튼으로 잇는다** — 마운트 직후의 `ResizeObserver`가 트리를 접는 경우다. 포커스가 이미 다른
    컨트롤로 옮겨 갔으면 뺏지 않는다(사라진 노드에 있었을 때만).
  */
  useLayoutEffect(() => {
    const node = treeLanded.current;
    if (!treeCollapsed || node === null) return;
    treeLanded.current = null;
    const active = document.activeElement;
    if (!node.isConnected && (active === null || active === document.body || active === node)) treeToggle()?.focus();
  }, [treeCollapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 flex-col gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2">
            <h1 ref={titleRef} tabIndex={-1} className="text-lg font-medium">{m.common.nav.translations}</h1>
            <CountBadge count={tree.projectKeyCount} label={m.translations.keys(tree.projectKeyCount)} />
          </span>
          <span className="ml-auto flex items-center gap-2">
            {role === "OWNER" ? (
              <span onClickCapture={event => { if (dirty.length > 0 && syncAvailable) { event.preventDefault(); event.stopPropagation(); openSync(); } }}>
                {/* 끊김이 먼저다 — 그 원인은 Publish가 끝나도 풀리지 않는다(Home 머리와 같은 순서). */}
                <SyncButton slug={slug} surfaceSlug={routeSurfaceSlug} name={props.sync.name} branch={props.sync.branch} role={role} unsent={props.unpublished}
                  paused={!syncAvailable || publish.pending}
                  /* 끊김 → Publish 진행 → 다른 실행의 lease 순이다 — 앞의 둘은 lease가 끝나도 풀리지 않는다. */
                  pausedReason={!availability.sync ? connectionBlock ?? m.repositorySync.paused : publish.pending ? m.repositorySync.waitPublish : m.repositorySync.running}
                  open={syncOpen} onOpenChange={setSyncOpen} onPendingChange={setSyncPending}
                  onResult={onSyncResult} fallbackFocusRef={titleRef} />
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
              <PublishButton id={publishButtonId} count={props.unpublished} publish={publish} disabled={syncPending || !availability.publish} pausedReason={connectionBlock ?? undefined} />
            </span>

          </span>
        </div>
        {/*
          ⚠️ **툴바는 검색 하나뿐이고 왼쪽에 선다** (2026-10-02 사용자 — 패널마다 자기를 좁히는 필터를 든다: 트리 = 범위 · 키 목록 = Status · 번역값 = 언어).
          검색은 어느 패널의 것도 아니라 전 소스를 본다. label과 placeholder를 가른다(DESIGN §10) — 좁힌 검색 중에도 접근 이름이 참이어야 한다.
        */}
        <div ref={toolbarRef} data-toolbar="" className="flex flex-wrap items-center gap-2">
          <SearchInput inputClassName="w-80" value={query.q} label={w.filters.search} placeholder={w.filters.searchPlaceholder} onSearch={search} />
        </div>
        {/*
          ⚠️ **두 배너는 조건부 분기 밖의 형제다** (DESIGN §6.1 · POSTMORTEM 2026-09-07) — 분기 안에 두면 `router.refresh()`가 방금 만든
          상태를 언마운트한다. 대기 배너가 먼저다: "왜 지금 보내야 하는가"가 "보내라"보다 앞이다. Sync 결과는 Sync Dialog가 든다(sync-lock S5).
        */}
        <div className="space-y-3 empty:hidden">
          <SyncLockBanner reopensBy={props.writeLock?.reopensBy ?? null} />
          <BasePendingBanner baseLocale={props.baseLocale} declaredBaseLocale={props.declaredBaseLocale} />
          <EditLossBanner count={props.unpublished} publishButtonId={publishButtonId} blockedReason={connectionBlock} />
        </div>
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex h-full min-h-0" style={layout?.scrollWidth ? { minWidth: layout.scrollWidth } : undefined}>
          <div className="border-border bg-background relative flex min-h-0 shrink-0 overflow-hidden rounded-lg border" style={layout ? { width: layout.left } : { width: PANEL.tree + PANEL.list }}>
            {/* 트리 = 목록 범위다(translation-tree-range). 전 소스 검색이면 범위는 `All sources`이고 위치가 따로 표시된다. */}
            {!treeCollapsed && (
              <TreePanel tree={tree} nodes={treeNodes} surfaceSlug={view.surface} ns={shown.ns} rangeAll={rangeAll} allSources={allSourcesNode}
                onSelect={selectTree} onSelectAll={selectAllSources} className="border-border shrink-0 border-r" width={layout?.tree ?? PANEL.tree} />
            )}
            <KeyList
              list={rows}
              // 제목은 `Keys`로 고정이다 — Status는 머리의 메뉴 라벨이 말한다(2026-10-02).
              title={w.list.keys}
              titleRef={listTitleRef}
              count={list.matchedKeyCount}
              savedExtra={savedOutCount(rows)}
              selectedKeyId={view.keyId}
              // 접두는 범위가 전 소스이고 원본 트리의 소스가 둘 이상일 때만이다(조건 10).
              showSource={isAllSources(query) && tree.surfaces.length > 1}
              onSelect={onSelectRow}
              busy={navigating}
              treeButton={treeCollapsed ? { open: treeOverlay, controls: treeOverlayId, onToggle: () => setTreeOverlay(v => !v), breadcrumb: <span data-range-label="" className="text-muted-foreground text-xs">{rangeLabel}</span> } : undefined}
              empty={listEmpty}
              filter={
                <FilterMenu axis={w.filters.state.axis} label={STATUS_LABEL[shownStatus]()} on={shownStatus !== "all"} size="sm" disabled={noKeys} align="end"
                  value={shownStatus} hint={w.filters.state.newHint}
                  options={STATUSES.map(status => ({ value: status, label: STATUS_LABEL[status]() }))}
                  onSelect={value => go(withStatus(view.query, value as Status), "filter")}
                />
              }
            />
            {treeCollapsed && treeOverlay && (
              <TreeOverlay id={treeOverlayId} onClose={() => setTreeOverlay(false)}>
                <TreePanel tree={tree} nodes={treeNodes} surfaceSlug={view.surface} ns={shown.ns} rangeAll={rangeAll} allSources={allSourcesNode}
                  // 선택한 항목이 오버레이와 함께 사라지므로 토글로 돌려준다 — 안 하면 이동이 있든 없든 body로 떨어진다(T19 실측).
                  onSelect={(surface, ns) => { focusController(treeOverlayId); setTreeOverlay(false); selectTree(surface, ns); }}
                  onSelectAll={() => { focusController(treeOverlayId); setTreeOverlay(false); selectAllSources(); }} />
              </TreeOverlay>
            )}
          </div>
          <ResizeHandle layout={layout} onChange={rememberLeft} />
          <div data-panel="detail" aria-busy={navigating || undefined} className="border-border bg-background flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border">
            {/*
              ⚠️ **다른 키로 가는 동안 상세는 골격이다** (2026-09-28 사용자) — 선택 행은 낙관적으로 먼저 옮겨가는데 상세는 응답까지 옛 키의
              값이라, 새 행 옆에 옛 값이 서서 어느 키를 보는지 헷갈렸다. 필터·검색은 선택을 안 옮기므로 옛 상세가 그대로 선다.
              draft는 이 화면(reducer)이 들어 패널이 내려가도 잃지 않는다 — 확인창 판정은 이동 전에 이미 끝났다.
            */}
            {navigating && view.keyId !== keyId ? (
              <LocalePanelSkeleton />
            ) : detail === null ? (
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
                onEdit={(code, value) => edit({ type: "edit", locale: code, value })}
                onReset={code => edit({ type: "reset", locale: code })}
                onSave={() => void save()}
                copyHref={withQuery({ ...DEFAULT_TRANSLATION_QUERY, ns: detail.key.namespace, key: detail.key.id, keySurface: detail.key.surfaceSlug }, detail.key.surfaceSlug)}
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
                    publishing={publish.pending}
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
      <SyncLockDialog reopensBy={syncLock} onClose={() => setSyncLock(null)} />
    </div>
  );
}

function Footer({ alertId, dirty, status, saving, resultRef, saveRef, hasPending, revertBlocked, revertBusy, publishing, saveDisabled, onSave, onRevert, onCheck, slug, storageBlocked }: {
  alertId: string; dirty: number; status: FooterStatus | null; saving: boolean; resultRef: React.RefObject<HTMLSpanElement | null>; saveRef: React.RefObject<HTMLButtonElement | null>;
  hasPending: boolean; revertBlocked: RevertReason | null; revertBusy: boolean; publishing: boolean; saveDisabled: boolean;
  onSave: () => void; onRevert: () => void; onCheck: () => void; slug: string; storageBlocked: boolean;
}) {
  const w = m.translations.workspace;
  const reasonId = useId();
  const saveReasonId = useId();
  /*
    ⚠️ **Publish 중 [Save]는 `disabled`가 아니라 `aria-disabled` + 보이는 사유다** (audit-ux #10 · D3 — DESIGN §6.65). 저장할 것이
    있을 때만 잠긴다 — 없으면 원래 꺼져 있고 사유가 할 말이 없다. 끝나면 같은 버튼이 풀리므로 포커스가 그대로 남는다.
  */
  const saveLocked = publishing && !saveDisabled;
  // 복구 문구는 미저장이 남은 동안의 말이다 — 0이면 `edit`가 이미 지웠다 (malmoi#100).
  const text = dirty > 0 ? (status?.kind === "saved" ? w.footer.savedSince(dirty) : status?.kind === "restored" ? w.footer.session.restored(status.count) : w.footer.unsaved(dirty))
    : status?.kind === "saved" ? (hasPending ? w.footer.savedNotSent : w.footer.saved)
    : status?.kind === "reverted" ? w.revert.reverted
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
          {saveLocked && <span id={saveReasonId} className="text-muted-foreground min-w-0 text-xs">{m.repositorySync.waitPublish}</span>}
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          {hasPending && (
            // ⚠️ **`loading`을 쓰지 않는다** — 그쪽은 진짜 `disabled`를 걸어 방금 누른 버튼이 포커스를 잃고
            // busy 사유(describedby)에 닿을 길이 사라진다 (DESIGN §6.65). `busy`가 포커스를 지키며 스피너를 든다.
            // 확정이 `danger`라 트리거도 `danger`다 — 확인 창을 열기 전에 되돌릴 수 없다는 신호가 선다(DESIGN §2.4 동작 규칙 · 3-Y2).
            <Button variant="danger" aria-disabled={revertBlocked !== null ? "true" : undefined} aria-describedby={revertBlocked !== null ? reasonId : undefined}
              busy={revertBusy} onClick={() => { if (revertBlocked === null) onRevert(); }}>
              {w.revert.button}
            </Button>
          )}
          <Button ref={saveRef} variant="primary" loading={saving} disabled={saveDisabled}
            aria-disabled={saveLocked ? "true" : undefined} aria-describedby={saveLocked ? saveReasonId : undefined}
            onClick={() => { if (!saveLocked) onSave(); }}>{w.footer.save}</Button>
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
  // 보관은 회색이다 — 실패가 아니다(2026-09-30 상태 통일).
  archived: () => <Alert variant="neutral" title={m.translations.workspace.footer.archived} />,
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
    // 팝오버 계열의 그림자다(§4.5 — DropdownMenu·Select와 같은 `shadow-md`, 5-Y17).
    <div ref={ref} id={id} className="border-border bg-popover shadow-md absolute top-14 left-3 z-20 flex max-h-80 w-70 flex-col overflow-hidden rounded-lg border">
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

