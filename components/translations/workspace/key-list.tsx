"use client";

import { PanelLeftOpen } from "lucide-react";
import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";

import { CountBadge } from "@/components/ui/count-badge";
import { Button } from "@/components/ui/button";
import { ListItemButton } from "@/components/ui/list-item";
import type { TranslationListRow } from "@/lib/keys/translation-list";
import { m } from "@/lib/i18n";
import type { ListGeneration } from "@/lib/translations/saved-rows";
import { cn } from "@/lib/utils";

/**
 * 키 목록 (핸드오프 `2c`). 첫 줄은 **리포 원문**(`sourceText`), 둘째 줄은 키 이름 13 `#737373`.
 *
 * ⚠️ **미번역은 회색이다** (2026-09-30 상태 통일 — 미번역은 이상이 아니라 할 일이다). 호박은 검토 대기(`Needs review`)만 든다. 낱말(`{n} untranslated` · `Complete`)이 둘을 가른다.
 * ⚠️ **저장으로 조건을 벗어난 행은 자리에 남는다**(취소선 + `Saved`) — 다른 키를 눌러도 그대로이고 재필터에서만 빠진다.
 * ⚠️ **선택은 배경만 바꾼다** — 굵기를 주지 않는다(`sidebar.tsx`).
 * ⚠️ **Tab 정지점은 하나다** (translation-filter-scope T8 — roving tabindex) — 목록이 전량이라 행마다 정지점이면 목록을 지나는 데 수천 번을
 *    눌러야 했다. 정지점은 방금 포커스한 행 → 선택 행 → 첫 행 순이고, ↑/↓·Home/End가 포커스를 옮기며 Enter·Space(버튼 기본 동작)가 선택한다.
 *    포커스한 행이 목록에서 사라지면 정지점(없으면 목록 제목)으로 옮긴다 — `body`로 빠지지 않게(POSTMORTEM 2026-09-24).
 */
export function KeyList({ list, title, titleRef, count, savedExtra, selectedKeyId, showSource, onSelect, busy = false, treeButton, empty }: {
  list: ListGeneration<TranslationListRow>;
  title: string;
  /** 빈 상태 버튼의 이동이 끝나면 포커스가 여기로 착지한다 — 빈 상태가 사라지며 `body`로 빠지지 않게. */
  titleRef?: Ref<HTMLHeadingElement>;
  count: number;
  savedExtra: number;
  selectedKeyId: string | undefined;
  showSource: boolean;
  onSelect: (row: TranslationListRow) => void;
  /** 조작의 응답을 기다린다 (audit-ux #7) — 행은 응답이 와야 바뀌므로 목록이 busy다. 선택 행은 호출부가 낙관적으로 먼저 옮긴다. */
  busy?: boolean;
  /** 트리가 접혔을 때 목록 머리에 들어가는 트리 버튼(README §7 — 아이콘 레일을 만들지 않는다). */
  treeButton?: { open: boolean; controls: string; onToggle: () => void; breadcrumb: ReactNode };
  empty: ReactNode;
}) {
  const w = m.translations.workspace.list;
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [focusedKeyId, setFocusedKeyId] = useState<string | null>(null);
  const ids = useMemo(() => new Set(list.rows.map(entry => entry.row.keyId)), [list]);
  const tabStop = focusedKeyId !== null && ids.has(focusedKeyId) ? focusedKeyId
    : selectedKeyId !== undefined && ids.has(selectedKeyId) ? selectedKeyId
    : list.rows[0]?.row.keyId;

  /*
    포커스가 목록 안에 있었나 — 행이 지워지면 blur의 `relatedTarget`이 없으므로 그때는 유지하고, 목록 밖의 요소로 옮겨 갔을 때만 푼다.
    목록이 바뀐 커밋에 포커스가 `body`에 있으면 지워진 행과 함께 빠진 것이다.
  */
  const hadFocus = useRef(false);
  useLayoutEffect(() => {
    if (hadFocus.current && (document.activeElement === null || document.activeElement === document.body)) {
      (listRef.current?.querySelector<HTMLElement>('[data-key-row][tabindex="0"]') ?? document.getElementById(headingId))?.focus();
    }
    // 목록이 비면 행이 없다 — 표식을 풀어야 나중에 목록이 다시 찼을 때 딴 데 있는 포커스를 끌어오지 않는다.
    if (list.rows.length === 0) hadFocus.current = false;
  }, [list, headingId]);
  function onFocus(event: FocusEvent<HTMLUListElement>) {
    hadFocus.current = true;
    const id = event.target instanceof HTMLElement ? event.target.dataset.keyRow : undefined;
    if (id !== undefined) setFocusedKeyId(id);
  }
  function onBlur(event: FocusEvent<HTMLUListElement>) {
    if (event.relatedTarget === null || event.currentTarget.contains(event.relatedTarget)) return;
    hadFocus.current = false;
    // 목록을 떠나면 정지점은 다시 선택 행이다.
    setFocusedKeyId(null);
  }
  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-key-row]")];
    const index = rows.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    const next = event.key === "ArrowDown" ? Math.min(index + 1, rows.length - 1)
      : event.key === "ArrowUp" ? Math.max(index - 1, 0)
      : event.key === "Home" ? 0
      : event.key === "End" ? rows.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    rows[next]?.focus();
  }
  return (
    <div data-panel="list" aria-busy={busy || undefined} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        {treeButton !== undefined && (
          <Button size="sm" aria-label={m.translations.workspace.tree.open} aria-expanded={treeButton.open} aria-controls={treeButton.open ? treeButton.controls : undefined} onClick={treeButton.onToggle} className="size-7 p-0">
            <PanelLeftOpen className="size-3.5 text-neutral-600" aria-hidden />
          </Button>
        )}
        <h2 id={headingId} ref={titleRef} tabIndex={-1} className="text-base font-medium">{title}</h2>
        <CountBadge count={count} label={m.translations.keys(count)} />
        {treeButton !== undefined && <span className="min-w-0 truncate">{treeButton.breadcrumb}</span>}
        <span className="text-muted-foreground ml-auto shrink-0 text-xs">
          {savedExtra > 0 && <>{w.savedExtra(savedExtra)} · </>}{w.incompleteFirst}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* <ul>이어야 스크린리더가 "n개 중 m번째"를 읽는다 — 옛 표는 행 수를 알려 줬다. */}
        {list.rows.length === 0 ? empty : <ul ref={listRef} aria-labelledby={headingId} onKeyDown={onKeyDown} onFocus={onFocus} onBlur={onBlur}>{list.rows.map(({ row, savedOut }, index) => (
          <KeyRow key={row.keyId} row={row} savedOut={savedOut} first={index === 0} selected={row.keyId === selectedKeyId} tabStop={row.keyId === tabStop} showSource={showSource} onSelect={onSelect} />
        ))}</ul>}
      </div>
    </div>
  );
}

/**
 * ⚠️ **행은 `memo`다** (translation-filter-scope design §3.1) — 목록이 전량이 되어 수천 행이 한 번에 서는데, draft `useReducer`가 워크스페이스
 * 최상위라 상세에서 한 글자 칠 때마다 전 행이 다시 렌더됐다. 그래서 호출부의 `onSelect`는 렌더마다 같은 함수여야 한다(`workspace.tsx`).
 */
const KeyRow = memo(function KeyRow({ row, savedOut, first, selected, tabStop, showSource, onSelect }: {
  row: TranslationListRow;
  savedOut: boolean;
  first: boolean;
  selected: boolean;
  tabStop: boolean;
  showSource: boolean;
  onSelect: (row: TranslationListRow) => void;
}) {
  const w = m.translations.workspace.list;
  return (
    <li>
      <ListItemButton
        data-key-row={row.keyId}
        selected={selected}
        tabIndex={tabStop ? 0 : -1}
        onClick={() => onSelect(row)}
        className={cn("flex items-start gap-3 border-t px-4 py-3", first ? "border-divider" : "border-border")}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className={cn("text-sm leading-[1.45]", savedOut && "text-muted-foreground line-through")}>{row.sourceText}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
              {showSource ? `${row.surfaceSlug} · ${row.key}` : row.key}
            </span>
            {row.hasPending && <Pill>{w.notSent}</Pill>}
            {row.hasReview && <span className="text-xs text-amber-700">{w.needsReview}</span>}
          </span>
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {savedOut ? w.saved : row.missingCount > 0 ? w.missing(row.missingCount) : w.complete}
        </span>
      </ListItemButton>
    </li>
  );
});

/** `Not sent` 알약 — 테두리 `#e5e5e5` · 글자 `#525252`. ⚠️ 시안은 12px인데 스케일에 12가 없어 `text-xs`(13)다 (audit #45 · DESIGN §4). */
export function Pill({ children }: { children: ReactNode }) {
  return <span className="border-border inline-flex shrink-0 items-center rounded-full border px-[7px] py-px text-xs whitespace-nowrap text-neutral-600">{children}</span>;
}
