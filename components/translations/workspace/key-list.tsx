"use client";

import { PanelLeftOpen } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListItemButton } from "@/components/ui/list-item";
import type { TranslationListRow } from "@/lib/keys/translation-list";
import { m } from "@/lib/i18n";
import type { ListGeneration } from "@/lib/translations/saved-rows";
import { cn } from "@/lib/utils";

/**
 * 키 목록 (핸드오프 `2c`). 첫 줄은 **리포 원문**(`sourceText`), 둘째 줄은 키 이름 13 `#737373`.
 *
 * ⚠️ **상태 색은 미완에만 든다** — `{n} missing`은 amber, `Complete`는 보조색. 완료가 다수라 완료에 색을 주면 남은 것이 묻힌다.
 * ⚠️ **저장으로 조건을 벗어난 행은 자리에 남는다**(취소선 + `Saved`) — 다른 키를 눌러도 그대로이고 재필터에서만 빠진다.
 * ⚠️ **선택은 배경만 바꾼다** — 굵기를 주지 않는다(`sidebar.tsx`).
 */
export function KeyList({ list, title, count, savedExtra, selectedKeyId, showSource, onSelect, onMore, treeButton, empty }: {
  list: ListGeneration<TranslationListRow>;
  title: string;
  count: number;
  savedExtra: number;
  selectedKeyId: string | undefined;
  showSource: boolean;
  onSelect: (row: TranslationListRow) => void;
  onMore: (() => void) | null;
  /** 트리가 접혔을 때 목록 머리에 들어가는 트리 버튼(README §7 — 아이콘 레일을 만들지 않는다). */
  treeButton?: { open: boolean; onToggle: () => void; breadcrumb: ReactNode };
  empty: ReactNode;
}) {
  const w = m.translations.workspace.list;
  const headingId = useId();
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-[53px] shrink-0 items-center gap-2 px-4">
        {treeButton !== undefined && (
          <Button size="sm" aria-label={m.translations.workspace.tree.open} aria-expanded={treeButton.open} onClick={treeButton.onToggle} className="size-7 rounded-[10px] p-0">
            <PanelLeftOpen className="size-3.5 text-neutral-600" aria-hidden />
          </Button>
        )}
        <h2 id={headingId} className="text-[15px] font-medium tracking-[0.015em]">{title}</h2>
        <Badge variant="neutral">{count.toLocaleString("en-US")}</Badge>
        {treeButton !== undefined && <span className="min-w-0 truncate">{treeButton.breadcrumb}</span>}
        <span className="text-muted-foreground ml-auto shrink-0 text-xs tracking-[0.02em]">
          {savedExtra > 0 && <>{w.savedExtra(savedExtra)} · </>}{w.incompleteFirst}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* <ul>이어야 스크린리더가 "n개 중 m번째"를 읽는다 — 옛 표는 행 수를 알려 줬다. */}
        {list.rows.length === 0 ? empty : <ul aria-labelledby={headingId}>{list.rows.map(({ row, savedOut }, index) => {
          const selected = row.keyId === selectedKeyId;
          return (
            <li key={row.keyId}>
              <ListItemButton
                data-key-row={row.keyId}
                selected={selected}
                onClick={() => onSelect(row)}
                className={cn("flex items-start gap-3 border-t px-4 py-3", index === 0 ? "border-divider" : "border-border")}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className={cn("text-sm leading-[1.45] tracking-[0.015em]", savedOut && "text-muted-foreground line-through")}>{row.sourceText}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
                      {showSource ? `${row.surfaceSlug} · ${row.key}` : row.key}
                    </span>
                    {row.hasPending && <Pill>{w.notSent}</Pill>}
                    {row.hasReview && <span className="text-xs tracking-[0.02em] text-amber-700">{w.needsReview}</span>}
                  </span>
                </span>
                <span className={cn("shrink-0 text-xs tracking-[0.02em]", savedOut ? "text-muted-foreground" : row.missingCount > 0 ? "text-amber-700" : "text-muted-foreground")}>
                  {savedOut ? w.saved : row.missingCount > 0 ? w.missing(row.missingCount) : w.complete}
                </span>
              </ListItemButton>
            </li>
          );
        })}</ul>}
        {onMore !== null && list.rows.length > 0 && (
          <div className="border-border border-t px-4 py-3">
            <Button variant="link" className="h-auto px-0" onClick={onMore}>{w.more}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** `Not sent` 알약 — 테두리 `#e5e5e5` · 글자 `#525252` · 12px(README §5). */
export function Pill({ children }: { children: ReactNode }) {
  return <span className="border-border inline-flex shrink-0 items-center rounded-full border px-[7px] py-px text-[12px] tracking-[0.02em] whitespace-nowrap text-neutral-600">{children}</span>;
}
