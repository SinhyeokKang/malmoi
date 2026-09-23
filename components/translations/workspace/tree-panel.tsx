"use client";

import { ChevronDown, ChevronRight, FileJson2, Folder, Layers, Search } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ListItemButton } from "@/components/ui/list-item";
import type { TranslationTree } from "@/lib/keys/translation-list";
import { m } from "@/lib/i18n";
import { ALL_NAMESPACES } from "@/lib/translations/query";
import { cn } from "@/lib/utils";

/**
 * 소스 → 네임스페이스 트리 (핸드오프 `2a` · `2k-B`). **네임스페이스에서 멈춘다** — 키를 넣으면 수백 행이 이 열에 들어온다.
 *
 * ⚠️ **선택은 배경만 바꾸고 굵기는 그대로다** — 굵기는 계층만 든다(소스 500 · 네임스페이스 400, `sidebar.tsx`와 같은 규칙).
 * ⚠️ **leadingIcon**: 소스 `chevron + file-json-2`(16 · `#525252`), `All namespaces`는 `layers`, 네임스페이스는 `folder`(14 · `#a3a3a3`) — 2k-B 확정.
 * ⚠️ **숫자는 언어와 무관한 활성 키 수다** — 남은 수를 넣으면 같은 열의 숫자가 언어에 따라 통째로 바뀐다(README §4).
 */
const FILTER_AT = 13;

export function TreePanel({ tree, surfaceSlug, ns, onSelect, className, width }: {
  tree: TranslationTree;
  /** px — 폭 계약(`planTranslationPanelLayout`)이 정한다. 겹친 패널 안에서는 주지 않는다(부모 폭을 채운다). */
  width?: number;
  surfaceSlug: string;
  ns: string;
  onSelect: (surfaceSlug: string, ns: string) => void;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(tree.surfaces.filter(s => s.slug !== surfaceSlug && tree.surfaces.length > 1).map(s => s.slug)));
  const [filter, setFilter] = useState("");
  const namespaceCount = tree.surfaces.reduce((sum, s) => sum + s.namespaces.length, 0);
  const needle = filter.trim().toLowerCase();

  return (
    <div className={cn("flex min-h-0 flex-col", className)} style={width === undefined ? undefined : { width }}>
      <div className="flex h-[53px] shrink-0 items-center gap-2 px-4">
        <h2 className="text-[15px] font-medium tracking-[0.015em]">{m.translations.workspace.tree.title}</h2>
        <Badge variant="neutral">{tree.surfaces.length}</Badge>
      </div>
      <div className="border-divider flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto border-t p-2">
        {namespaceCount >= FILTER_AT && (
          <div className="relative mb-1.5">
            <Search className="text-muted-foreground pointer-events-none absolute top-2 left-2.5 size-3.5" aria-hidden />
            <Input
              type="search"
              value={filter}
              onChange={event => setFilter(event.target.value)}
              aria-label={m.translations.workspace.tree.filter}
              placeholder={m.translations.workspace.tree.filter}
              className="h-8 pl-8 text-xs"
            />
          </div>
        )}
        {tree.surfaces.map(surface => {
          const open = !collapsed.has(surface.slug);
          const namespaces = needle === "" ? surface.namespaces : surface.namespaces.filter(n => n.name.toLowerCase().includes(needle));
          const current = surface.slug === surfaceSlug;
          return (
            <div key={surface.id} className="flex flex-col gap-0.5">
              <ListItemButton
                aria-expanded={open}
                onClick={() => setCollapsed(prev => { const next = new Set(prev); if (open) next.add(surface.slug); else next.delete(surface.slug); return next; })}
                className="flex items-center gap-2 rounded-sm px-2 py-[7px] text-sm tracking-[0.02em]"
              >
                <span className="flex text-neutral-600">{open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}</span>
                <span className="flex text-neutral-600"><FileJson2 className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1 truncate font-medium">{surface.slug}</span>
                <span className="text-muted-foreground text-xs">{surface.keyCount.toLocaleString("en-US")}</span>
              </ListItemButton>
              {open && (
                <>
                  <TreeItem
                    icon={<Layers className="size-3.5" aria-hidden />}
                    label={m.translations.workspace.tree.allNamespaces}
                    count={surface.keyCount}
                    selected={current && ns === ALL_NAMESPACES}
                    onClick={() => onSelect(surface.slug, ALL_NAMESPACES)}
                  />
                  {namespaces.map(namespace => (
                    <TreeItem
                      key={namespace.name}
                      icon={<Folder className="size-3.5" aria-hidden />}
                      label={namespace.name}
                      count={namespace.keyCount}
                      selected={current && ns === namespace.name}
                      onClick={() => onSelect(surface.slug, namespace.name)}
                    />
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TreeItem({ icon, label, count, selected, onClick }: { icon: ReactNode; label: string; count: number; selected: boolean; onClick: () => void }) {
  return (
    <ListItemButton selected={selected} onClick={onClick} className="flex items-center gap-2 rounded-sm py-1.5 pr-2 pl-[34px] text-sm tracking-[0.02em]">
      <span className="flex text-neutral-400">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground text-xs">{count.toLocaleString("en-US")}</span>
    </ListItemButton>
  );
}
