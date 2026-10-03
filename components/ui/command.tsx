"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { m } from "@/lib/i18n";
import { nextActive, reconcileActive } from "@/lib/search/keys";
import { cn } from "@/lib/utils";
import { Input } from "./input";
import { Kbd } from "./kbd";

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

export function CommandInput({ value, onValueChange, label, placeholder }: {
  value: string; onValueChange: (value: string) => void; label: string; placeholder: string;
}) {
  const { listId, activeId, optionId } = useCommand();
  return <div className="border-divider shrink-0 border-b px-4 py-3">
    <Input width="full" variant="bare" icon={<Search />} role="combobox" aria-label={label}
      aria-expanded="true" aria-autocomplete="list" aria-controls={listId}
      aria-activedescendant={activeId === null ? undefined : optionId(activeId)}
      data-initial-focus value={value} placeholder={placeholder} autoComplete="off"
      onChange={event => onValueChange(event.target.value)} />
  </div>;
}

/** 실패 줄은 `danger`(빨강), 로딩 줄은 muted다 — 실패를 로딩과 같은 회색으로 말하지 않는다(search-ux-unify C3). */
export function CommandStatus({ tone = "muted", children }: { tone?: "muted" | "danger"; children: ReactNode }) {
  return <div role="status" aria-live="polite" data-tone={tone} className={cn("shrink-0 px-4 py-2 text-xs empty:hidden", tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{children}</div>;
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

export function CommandGroup({ heading, children }: { heading: string; children: ReactNode }) {
  const headingId = useId();
  return <div role="group" aria-labelledby={headingId} className="border-divider border-b pb-2 last:border-b-0">
    <div id={headingId} className="text-foreground px-4 py-2 text-xs font-medium">{heading}</div>
    {children}
  </div>;
}

export function CommandItem({ id, href, title, icon, context, description, badge, onNavigate }: {
  id: string; href: string; title: ReactNode; icon?: ReactNode; context?: ReactNode; description?: ReactNode; badge?: ReactNode;
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
    <Link ref={anchor} href={href} tabIndex={-1} className={cn(
      "mx-2 flex min-w-0 items-center gap-3 rounded-md border px-2 py-2 text-sm focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
      selected ? "border-ring bg-accent" : "border-transparent",
    )}>
      {icon !== undefined && <span aria-hidden className="text-muted-foreground shrink-0 [&>svg]:size-4">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate">{title}{context !== undefined && <span className="text-muted-foreground text-xs"> · {context}</span>}</span>
        {description !== undefined && <span className="text-muted-foreground truncate whitespace-nowrap text-xs">{description}</span>}
      </span>
      {badge}
      {selected && <span aria-hidden className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">{m.search.goTo}<Kbd>↵</Kbd></span>}
    </Link>
  </div>;
}
