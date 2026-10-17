"use client";

import { ChevronDown } from "lucide-react";
import { Popover as Primitive } from "radix-ui";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { nextActive, reconcileActive } from "@/lib/search/keys";
import { cn } from "@/lib/utils";

import { Input } from "./input";
import { useImeGuard } from "./use-ime-guard";

export type ComboboxOption = { value: string; label: ReactNode; aside?: ReactNode; disabled?: boolean };
export type ComboboxGroup = { heading?: string; options: readonly ComboboxOption[] };

/**
 * **입력 + 목록 콤보박스** (locale-add E1 — 시안 A1 언어 추가 칸이 첫 소비자). 값은 자유 입력이고, 목록 행을 고르면 `onSelect`가 그 값을 받는다.
 * 거르기·`Use this code` 같은 행 구성은 소비자가 `groups`로 넘긴다 — 이 프리미티브는 열고 닫기·활성 행·키보드만 든다.
 *
 * ⚠️ **`Command`를 쓰지 않는다** — 그것은 ⌘K 이동 전용이라 행이 링크이고 Enter가 `a[href]`를 누른다. 활성 판정(`nextActive`·`reconcileActive`)과
 * IME 가드(`useImeGuard`)는 같은 것을 쓴다.
 * ⚠️ **포커스는 늘 입력에 있다** — 목록은 `aria-activedescendant`로 가리키고, 행의 mousedown 기본 동작을 막아 누른 뒤에도 입력에 남는다.
 * Popover가 열리며 내용으로 포커스를 옮기는 기본 동작(`onOpenAutoFocus`)도 막는다.
 * ⚠️ **열린 목록의 Esc는 목록만 닫는다** — Radix는 가장 위 레이어 하나만 닫으므로 바깥 Dialog는 남는다. IME 조합 중 Esc·Enter는 조합의 것이다.
 * ⚠️ 꺼진 행은 남기고(`aria-disabled`) ↑↓가 건너뛴다 — "이미 있음"을 숨기면 왜 목록에 없는지 모른다.
 * ⚠️ **Dialog 안이면 목록을 그 Dialog 안으로 portal한다**(DS #270) — `body`로 내보내면 Dialog의 스크롤 잠금(`react-remove-scroll`)이 목록 위의
 * 휠·트랙패드를 막아 키보드로만 내려갔다. 그릇을 찾아 넣을 뿐이라 prop을 늘리지 않는다.
 * ⚠️ **목록 그릇은 dialog가 아니다**(DS #271) — Radix Popover의 기본 `role="dialog"`가 이름 없는 dialog로 AX 트리에 섰다. ARIA는 combobox + listbox뿐이다.
 * ⚠️ **높이 상한은 첫 배치 전부터다**(DS #272) — 가용 높이 변수는 첫 측정 뒤에야 생겨, 그 전엔 상한 없는 전체 목록(20행 741px)을 재고 좁은 화면에서
 * 위로 뒤집혔다가 다음 갱신에 아래로 튀었다. 변수가 없을 때 300px로 떨어진다.
 */
export function Combobox({ id, value, onValueChange, onSelect, groups, placeholder, listLabel, readOnly = false, invalid = false, initialFocus = false, "aria-describedby": describedBy }: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (value: string) => void;
  groups: readonly ComboboxGroup[];
  placeholder?: string;
  /** 목록(listbox)의 접근 이름. */
  listLabel: string;
  readOnly?: boolean;
  invalid?: boolean;
  /** Dialog가 열릴 때 이 입력에 포커스한다(`DialogContent`의 `data-initial-focus` 표식). */
  initialFocus?: boolean;
  "aria-describedby"?: string;
}) {
  const ime = useImeGuard();
  const anchor = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setContainer(anchor.current?.closest<HTMLElement>('[role="dialog"]') ?? null); }, []);
  const listId = `${id}-listbox`;
  const flat = groups.flatMap(group => group.options);
  const optionId = (option: ComboboxOption) => `${id}-option-${flat.indexOf(option)}`;
  const enabled = flat.filter(option => !option.disabled).map(option => option.value);
  // 입력이 바뀌면 첫 행으로 돌아가고, 사람이 옮긴 뒤엔 목록이 늦게 바뀌어도 그 행을 지킨다(전역 검색과 같은 규칙).
  const [selection, setSelection] = useState({ ids: enabled, value, activeId: enabled[0] ?? null, moved: false });
  const changed = value !== selection.value || enabled.length !== selection.ids.length || enabled.some((item, index) => item !== selection.ids[index]);
  const reconciled = changed ? reconcileActive(enabled, selection, value !== selection.value) : selection;
  if (changed) setSelection({ ...reconciled, ids: enabled, value });
  const activeValue = reconciled.activeId;
  const active = flat.find(option => option.value === activeValue && !option.disabled);
  const shown = open && !readOnly && flat.length > 0;

  useLayoutEffect(() => {
    if (!shown || active === undefined) return;
    const node = document.getElementById(optionId(active));
    if (node !== null && list.current?.contains(node)) node.scrollIntoView?.({ block: "nearest" });
  });

  const choose = (option: ComboboxOption) => {
    if (option.disabled) return;
    setOpen(false);
    onSelect(option.value);
  };

  return <Primitive.Root open={shown} onOpenChange={setOpen}>
    <Primitive.Anchor asChild>
      <div ref={anchor} className="relative">
        <Input id={id} width="full" role="combobox" data-initial-focus={initialFocus || undefined} autoComplete="off" spellCheck={false} placeholder={placeholder} value={value} readOnly={readOnly}
          aria-expanded={shown} aria-autocomplete="list" aria-controls={shown ? listId : undefined}
          aria-activedescendant={shown && active !== undefined ? optionId(active) : undefined}
          aria-invalid={invalid || undefined} aria-describedby={describedBy} className="pr-8"
          onChange={event => { onValueChange(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onCompositionStart={ime.onCompositionStart}
          onCompositionEnd={ime.onCompositionEnd}
          onKeyDown={event => {
            if (ime.blocks(event.nativeEvent)) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!shown) { setOpen(true); return; }
              setSelection(current => ({ ...current, activeId: nextActive(enabled, activeValue, event.key === "ArrowDown" ? 1 : -1), moved: true }));
            } else if (event.key === "Enter" && shown && active !== undefined) {
              event.preventDefault();
              choose(active);
            }
          }} />
        <ChevronDown aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2" />
      </div>
    </Primitive.Anchor>
    <Primitive.Portal container={container ?? undefined}>
      <Primitive.Content role="presentation" side="bottom" align="start" sideOffset={4} collisionPadding={8}
        className="bg-popover border-border z-50 flex max-h-[min(300px,var(--radix-popover-content-available-height,300px))] w-(--radix-popover-trigger-width) flex-col overflow-y-auto rounded-lg border p-1 shadow-md"
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => event.preventDefault()}
        // 입력을 누른 것은 바깥이 아니다 — 닫으면 같은 클릭의 onClick이 다시 연다.
        onInteractOutside={event => { if (event.target instanceof Node && anchor.current?.contains(event.target)) event.preventDefault(); }}
        onEscapeKeyDown={event => { if (ime.blocks(event)) event.preventDefault(); }}>
        <div ref={list} id={listId} role="listbox" aria-label={listLabel}>
          {groups.map((group, index) => group.options.length === 0 ? null
            : <div key={group.heading ?? index} role="group" aria-label={group.heading} className="[[role=group]+&]:border-divider [[role=group]+&]:-mx-1 [[role=group]+&]:mt-1 [[role=group]+&]:border-t [[role=group]+&]:px-1 [[role=group]+&]:pt-1">
              {group.heading !== undefined && <div aria-hidden className="text-gray-dim px-2 pt-2 pb-1 text-xs font-medium">{group.heading}</div>}
              {group.options.map(option => <div key={option.value} id={optionId(option)} role="option" aria-selected={option === active} aria-disabled={option.disabled || undefined}
                className={cn("flex min-h-8 items-center gap-2 rounded px-2 text-sm", option.disabled ? "text-gray-dim cursor-default" : "cursor-pointer", option === active && "bg-accent")}
                onMouseDown={event => event.preventDefault()}
                onMouseMove={() => { if (!option.disabled && option !== active) setSelection(current => ({ ...current, activeId: option.value, moved: true })); }}
                onClick={() => choose(option)}>
                <span className="flex min-w-0 flex-1 items-center gap-2">{option.label}</span>
                {option.aside !== undefined && <span className={cn("shrink-0 text-xs", option.disabled ? "text-gray-dim" : "text-muted-foreground")}>{option.aside}</span>}
              </div>)}
            </div>)}
        </div>
      </Primitive.Content>
    </Primitive.Portal>
  </Primitive.Root>;
}
