"use client";

import { Search } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { m } from "@/lib/i18n";
import { nextActive, reconcileActive } from "@/lib/search/keys";
import { cn } from "@/lib/utils";
import { Input } from "./input";
import { Kbd } from "./kbd";
import { ListRow } from "./list-row";

const CommandContext = createContext<{
  listId: string;
  optionId: (id: string) => string;
  activeId: string | null;
  activate: (id: string) => void;
} | null>(null);

function useCommand() {
  const context = useContext(CommandContext);
  if (context === null) throw new Error("Command parts must be inside Command");
  return context;
}

/** ids는 표시 순서의 논리 ID다. DOM ID는 Command마다 이름 공간을 둔다. */
export function Command({ ids, query, children }: { ids: readonly string[]; query: string; children: ReactNode }) {
  const prefix = useId();
  const root = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const [selection, setSelection] = useState({ ids, query, activeId: ids[0] ?? null });
  const changed = query !== selection.query || ids.length !== selection.ids.length || ids.some((id, index) => id !== selection.ids[index]);
  const activeId = changed ? reconcileActive(selection.ids, ids, selection.activeId, query !== selection.query) : selection.activeId;
  // 렌더에서 함께 갱신해 제거된 option의 ID가 aria-activedescendant에 한 프레임 남지 않는다.
  if (changed) setSelection({ ids, query, activeId });
  const optionId = useCallback((id: string) => `${prefix}-option-${id}`, [prefix]);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(m.search.results(ids.length)), 300);
    return () => clearTimeout(timer);
  }, [ids.length, query]);

  return <CommandContext value={{ listId: `${prefix}-list`, optionId, activeId, activate: id => setSelection(current => ({ ...current, activeId: id })) }}>
    <div ref={root} className="flex min-h-0 flex-1 flex-col"
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; }}
      onKeyDown={event => {
        if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setSelection(current => ({ ...current, activeId: nextActive(ids, activeId, event.key === "ArrowDown" ? 1 : -1) }));
        } else if (event.key === "Enter" && activeId !== null) {
          event.preventDefault();
          const option = document.getElementById(optionId(activeId));
          if (option !== null && root.current?.contains(option)) option.querySelector<HTMLAnchorElement>("a[href]")?.click();
        }
      }}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
    </div>
  </CommandContext>;
}

/**
 * 입력 줄 — **간격 한 규칙**(search-ux-unify T0 시안): `pl-3`이면 `Input` bare의 글리프(`left-2.5`) 중심이 x30이라 행 타일 중심
 * (16 + 14)과 한 세로선이다. 오른쪽은 `[X] 갭 8 [Esc]` — Esc가 맨 끝에 고정되어 X가 생기고 사라져도 움직이지 않고, `pr-4`라
 * Esc 칩 오른쪽 끝이 행 `Go to ↵` 칩의 오른쪽 끝과 한 선이다. `sm` 미만에선 Esc 칩을 숨긴다(폭 규칙 — 활성과 무관).
 */
export function CommandInput({ value, onValueChange, label, placeholder }: {
  value: string; onValueChange: (value: string) => void; label: string; placeholder: string;
}) {
  const { listId, activeId, optionId } = useCommand();
  return <div className="border-divider flex h-12 shrink-0 items-center gap-2 border-b pr-4 pl-3">
    <div className="min-w-0 flex-1">
      <Input width="full" variant="bare" icon={<Search />} clearable role="combobox" aria-label={label}
        aria-expanded="true" aria-autocomplete="list" aria-controls={listId}
        aria-activedescendant={activeId === null ? undefined : optionId(activeId)}
        data-initial-focus value={value} placeholder={placeholder} autoComplete="off"
        onChange={event => onValueChange(event.target.value)} />
    </div>
    <span className="hidden shrink-0 sm:inline-flex"><Kbd>{m.common.keys.esc}</Kbd></span>
  </div>;
}

/**
 * 상태 줄 묶음 — 입력 아래·목록 위, 왼쪽 16(타일 왼쪽 모서리와 한 선). 줄마다 위아래 여백을 들지 않는다(줄 사이 4).
 * 실패 줄은 `danger`(빨강), 로딩 줄은 muted다 — 실패를 로딩과 같은 회색으로 말하지 않는다(search-ux-unify C3).
 * 줄이 없어도 live region은 남긴다 — 영역이 새로 생기는 순간의 내용은 낭독되지 않는다.
 */
export function CommandStatus({ lines }: { lines: readonly { tone: "muted" | "danger"; text: string }[] }) {
  return <div role="status" aria-live="polite" className="flex shrink-0 flex-col gap-1 px-4 pt-2 text-xs empty:hidden">
    {lines.map(line => <p key={line.text} data-tone={line.tone} className={line.tone === "danger" ? "text-destructive" : "text-muted-foreground"}>{line.text}</p>)}
  </div>;
}

export function CommandList({ label, children }: { label: string; children: ReactNode }) {
  const { listId, activeId, optionId } = useCommand();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (activeId === null) return;
    const option = document.getElementById(optionId(activeId));
    if (option !== null && ref.current?.contains(option)) option.scrollIntoView?.({ block: "nearest" });
  }, [activeId, optionId]);
  return <div ref={ref} id={listId} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto py-2">{children}</div>;
}

/**
 * 그룹은 세로 padding이 없고 두 번째부터 위쪽 선 하나다 — 선이 앞 그룹 마지막 행에 바로 붙어 활성 면이 선에서 뜨지 않는다.
 * 그룹 위 간격은 머리 `pt-4` 하나가 든다. 머리 `text-gray-dim`은 경계 표시라 행 보조 글자(#737373)와 층을 가른다(D15 — DESIGN §6.2 등재 이탈).
 */
export function CommandGroup({ heading, children }: { heading: string; children: ReactNode }) {
  const headingId = useId();
  return <div role="group" aria-labelledby={headingId} className="not-first:border-divider not-first:border-t">
    <div id={headingId} className="text-gray-dim px-4 pt-4 pb-1 text-xs font-medium">{heading}</div>
    {children}
  </div>;
}

/**
 * 행은 **`ListRow`다**(search-ux-unify C15) — Logs·Sources·Account 행과 같은 타일 + 제목 + 설명 조합. `icon`은 28 타일
 * (`ProjectThumbnail sm`·`IconTile sm`)이고 소비자가 넘긴다.
 * ⚠️ **활성은 `selected` 7% 하나다**(C16) — 비활성 행의 hover 면을 끈다. 마우스를 둔 채 ↑↓를 눌러도 칠해진 행이 하나다.
 * 활성 행에는 hover 클래스를 덧대지 않는다(`ListRow`가 selected일 땐 hover를 안 붙인다) — 덮으면 커서 아래 활성 면이 사라진다.
 * ⚠️ **`Go to ↵`는 늘 렌더하고 비활성은 `invisible`이다**(C19) — 활성일 때만 붙이면 행 높이·제목 폭이 출렁인다.
 * `aria-current={false}` — option 활성은 "현재 페이지"가 아니다(`ListRow`는 selected를 `aria-current`로 읽는다).
 */
export function CommandItem({ id, href, title, icon, context, description, badge, onNavigate }: {
  id: string; href: string; title: ReactNode; icon: ReactNode; context?: ReactNode; description?: ReactNode; badge?: ReactNode;
  /** 실제 클릭이 document 이탈 가드에 닿기 전에 닫힘을 예약한다. 클릭 요소를 동기 unmount하지 않는다. */
  onNavigate: (event: MouseEvent) => void;
}) {
  const { activeId, optionId, activate } = useCommand();
  const anchor = useRef<HTMLAnchorElement>(null);
  const selected = activeId === id;
  useEffect(() => {
    // React onClickCapture는 document capture보다 늦다. window가 닫힘→이탈 확인 순서를 보장한다.
    const navigate = (event: MouseEvent) => {
      if (event.target instanceof Node && anchor.current?.contains(event.target)) onNavigate(event);
    };
    window.addEventListener("click", navigate, true);
    return () => window.removeEventListener("click", navigate, true);
  }, [onNavigate]);

  return <div id={optionId(id)} role="option" aria-selected={selected} onMouseEnter={() => activate(id)}
    onMouseDown={event => event.preventDefault()}>
    <ListRow ref={anchor} href={href} tabIndex={-1} variant="canvas" selected={selected} aria-current={false}
      className={cn("text-sm", !selected && "hover:bg-transparent")}
      icon={icon}
      title={<span className="block truncate">{title}{context !== undefined && <span className="text-muted-foreground text-xs"> · {context}</span>}</span>}
      description={description === undefined ? undefined : <span className="block truncate whitespace-nowrap">{description}</span>}
      aside={<>
        {badge}
        <span aria-hidden className={cn("text-muted-foreground hidden shrink-0 items-center gap-2 text-xs sm:flex", !selected && "invisible")}>{m.search.goTo}<Kbd>{m.common.keys.enter}</Kbd></span>
      </>} />
  </div>;
}
