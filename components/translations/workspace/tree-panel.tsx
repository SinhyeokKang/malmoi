"use client";

import { ChevronDown, ChevronRight, FileJson2, Folder, Layers, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CountBadge } from "@/components/ui/count-badge";
import { Input } from "@/components/ui/input";
import { ListRow } from "@/components/ui/list-row";
import type { TranslationTree } from "@/lib/keys/translation-list";
import { useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import { formatNumber } from "@/lib/number-format";
import { ALL_NAMESPACES } from "@/lib/translations/query";
import { cn } from "@/lib/utils";

/**
 * 소스 → 네임스페이스 트리 (핸드오프 `2a` · `2k-B`). **네임스페이스에서 멈춘다** — 키를 넣으면 수백 행이 이 열에 들어온다.
 *
 * **트리 = 목록 범위다** (translation-tree-range — 2026-10-01 사용자). 소스 아래 `All namespaces`는 그 소스 전체, 네임스페이스 행은 그 네임스페이스다
 * (소스 행 자체는 펼침 토글이다). 검색 중이고 활성 소스가 둘 이상이면 맨 위에 `All sources` 노드가 선다.
 *
 * ⚠️ **선택은 배경만 바꾸고 굵기는 그대로다** — 굵기는 계층만 든다(소스 500 · 네임스페이스 400, `sidebar.tsx`와 같은 규칙).
 * ⚠️ **표시가 둘이다** — 범위는 `aria-current="true"`(면 0.07), 전 소스 범위의 **위치**(고른 키의 네임스페이스)는 `aria-current="location"`이고 면을
 *    비운다 — hover 0.03과 겹치면 포인터 아래 항목처럼 보인다(DESIGN §6.5). 글자만 한 단계 올린다(선례: 공개 문서 목차의 `location`).
 * ⚠️ **leadingIcon**: 소스 `chevron + file-json-2`(16 · `#525252`), `All namespaces`는 `layers`, 네임스페이스는 `folder`(14 · `#a3a3a3`) — 2k-B 확정.
 *    `All sources`는 `search`(16 · `#525252`) — 검색 중에만 서는 노드라는 표지다.
 * ⚠️ **숫자는 언어와 무관한 활성 키 수다** — 남은 수를 넣으면 같은 열의 숫자가 언어에 따라 통째로 바뀐다(README §4). **검색 중이면** 그 검색의
 *    일치 키 수이고(`nodes` — Status를 끈 채 그 노드를 눌렀을 때의 목록 수. Status·언어는 트리로 새지 않는다 — 2026-10-02), **노드를 숨기지 않는다** —
 *    0 노드는 흐리고 누를 수 없다(지금 범위·위치 노드는 예외).
 * ⚠️ **머리 배지와 `Filter namespaces` 임계는 원본 트리(`tree`)다** — 조건마다 배지가 흔들리지 않고, 입력이 사라지면서 남은 검색어가 보이지 않는
 *    필터가 되지 않는다.
 */
const FILTER_AT = 13;

export function TreePanel({ tree, nodes = tree, surfaceSlug, ns, allSources = null, rangeAll = false, onSelect, onSelectAll, className, width }: {
  tree: TranslationTree;
  /** 그릴 노드 — 검색 일치 수로 바꾼 트리(`countTree`). 없거나 원본이면 검색 중이 아니다. */
  nodes?: TranslationTree;
  /** px — 폭 계약(`planTranslationPanelLayout`)이 정한다. 겹친 패널 안에서는 주지 않는다(부모 폭을 채운다). */
  width?: number;
  /** 위치 — 경로 소스와 `ns`. 범위가 전 소스가 아니면 이것이 범위다. */
  surfaceSlug: string;
  ns: string;
  /** `All sources` 노드 — 검색 중이고 활성 소스가 둘 이상일 때만(호출부가 판정). 숫자는 전 소스 일치 수이고, 응답을 기다리는 동안은 `null`(비운다)이다. */
  allSources?: { count: number | null } | null;
  /** 범위가 전 소스인가(전 소스 검색). */
  rangeAll?: boolean;
  onSelect: (surfaceSlug: string, ns: string) => void;
  onSelectAll?: () => void;
  className?: string;
}) {
  const m = useMessages();
  const uiLocale = useUiLocale();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(tree.surfaces.filter(s => s.slug !== surfaceSlug && tree.surfaces.length > 1).map(s => s.slug)));
  const [filter, setFilter] = useState("");
  const namespaceCount = tree.surfaces.reduce((sum, s) => sum + s.namespaces.length, 0);
  const needle = filter.trim().toLowerCase();
  const counted = nodes !== tree;
  const listRef = useRef<HTMLDivElement>(null);

  /*
    ⚠️ **위치가 바뀌면 그 소스를 펼친다** — 전 소스 결과에서 키를 고르면 위치가 사용자가 접어 둔 소스로 옮겨 갈 수 있다. 렌더 중에 맞춘다(effect면 접힌
    한 프레임이 선다). 보이게 스크롤하는 것은 아래 effect다 — 마운트에는 하지 않는다(경로 소스가 이미 펼쳐져 서고, 재마운트 착지는 포커스가 든다).
  */
  const location = `${surfaceSlug}\u0000${ns}`;
  const [seenLocation, setSeenLocation] = useState(location);
  if (seenLocation !== location) {
    setSeenLocation(location);
    if (collapsed.has(surfaceSlug)) setCollapsed(prev => { const next = new Set(prev); next.delete(surfaceSlug); return next; });
  }
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    [...(listRef.current?.querySelectorAll<HTMLElement>("[data-tree-ns]") ?? [])]
      .find(node => node.dataset.treeSurface === surfaceSlug && node.dataset.treeNs === ns)?.scrollIntoView({ block: "nearest" });
  }, [surfaceSlug, ns]);

  /** 표시 판정 — 범위(`true`) · 전 소스 범위의 위치(`location`) · 없음. 활성 소스가 하나면 전 소스 범위의 선택 표시는 그 소스의 `All namespaces`가 든다. */
  const mark = (slug: string, name: string): "true" | "location" | undefined => {
    const here = slug === surfaceSlug && name === ns;
    if (!rangeAll) return here ? "true" : undefined;
    if (allSources === null && name === ALL_NAMESPACES) return "true";
    return here ? "location" : undefined;
  };

  return (
    <div data-tree-panel="" className={cn("flex min-h-0 flex-col", className)} style={width === undefined ? undefined : { width }}>
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        <h2 className="text-base font-medium">{m.translations.workspace.tree.title}</h2>
        <CountBadge count={tree.surfaces.length} label={m.sources.count(tree.surfaces.length)} />
      </div>
      <div ref={listRef} className="border-divider flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto border-t p-2">
        {namespaceCount >= FILTER_AT && (
          <div className="relative mb-1.5">
            <Input width="full" size="sm" icon={<Search />} clearable
              type="search"
              value={filter}
              onChange={event => setFilter(event.target.value)}
              aria-label={m.translations.workspace.tree.filter}
              placeholder={m.translations.workspace.tree.filter}
              // 트리 행과 같은 폭으로 채운다.
            />
          </div>
        )}
        {allSources !== null && (
          // 소스 행과 같은 높이·굵기(500)다 — 소스 위의 층이라 들여쓰지 않는다.
          <ListRow as="button" variant="canvas" ringInset
            data-tree-all=""
            selected={rangeAll}
            disabled={counted && allSources.count === 0 && !rangeAll}
            onClick={() => onSelectAll?.()}
            className={cn("flex items-center gap-2 rounded-sm px-2 py-[7px] text-sm", counted && allSources.count === 0 && "text-muted-foreground")}
          >
            <span className="flex text-gray-strong"><Search className="size-4" aria-hidden /></span>
            <span className="min-w-0 flex-1 truncate font-medium">{m.translations.workspace.tree.allSources}</span>
            {allSources.count !== null && <span className="text-muted-foreground text-xs">{formatNumber(allSources.count, uiLocale)}</span>}
          </ListRow>
        )}
        {nodes.surfaces.map(surface => {
          const open = !collapsed.has(surface.slug);
          // 위치 노드는 이름 거르기를 통과한다 — 거른 검색어가 지금 위치를 숨기면 어디에 있는지 잃는다.
          const namespaces = needle === "" ? surface.namespaces
            : surface.namespaces.filter(n => n.name.toLowerCase().includes(needle) || (surface.slug === surfaceSlug && n.name === ns));
          return (
            <div key={surface.id} className="flex flex-col gap-0.5">
              <ListRow as="button" variant="canvas" ringInset
                aria-expanded={open}
                data-tree-surface={surface.slug}
                onClick={() => setCollapsed(prev => { const next = new Set(prev); if (open) next.add(surface.slug); else next.delete(surface.slug); return next; })}
                className={cn("flex items-center gap-2 rounded-sm px-2 py-[7px] text-sm", counted && surface.keyCount === 0 && "text-muted-foreground")}
              >
                <span className="flex text-gray-strong">{open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}</span>
                <span className="flex text-gray-strong"><FileJson2 className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1 truncate font-medium">{surface.slug}</span>
                <span className="text-muted-foreground text-xs">{formatNumber(surface.keyCount, uiLocale)}</span>
              </ListRow>
              {open && (
                <>
                  <TreeItem
                    surface={surface.slug}
                    ns={ALL_NAMESPACES}
                    icon={<Layers className="size-3.5" aria-hidden />}
                    label={m.translations.workspace.tree.allNamespaces}
                    count={surface.keyCount}
                    counted={counted}
                    mark={mark(surface.slug, ALL_NAMESPACES)}
                    onClick={() => onSelect(surface.slug, ALL_NAMESPACES)}
                  />
                  {namespaces.map(namespace => (
                    <TreeItem
                      key={namespace.name}
                      surface={surface.slug}
                      ns={namespace.name}
                      icon={<Folder className="size-3.5" aria-hidden />}
                      label={namespace.name}
                      count={namespace.keyCount}
                      counted={counted}
                      mark={mark(surface.slug, namespace.name)}
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

/**
 * `counted` — 검색 중이다. 그때 0 노드는 흐리고 **누를 수 없다**(눌러도 빈 목록이다 — Status는 이 판정에 없다). 범위·위치 노드는 0이어도 누를 수 있다 — 오버레이를 열 때의
 * 포커스 대상(`[aria-current="true"]`)이 사라지지 않게. 기존 토큰만 쓴다(design §4.3).
 * ⚠️ `ListRow`은 `aria-current`를 `selected`로만 세운다 — 위치 표시는 호출부 prop이 뒤에서 덮는다(`{...props}`가 마지막이다).
 */
function TreeItem({ surface, ns, icon, label, count, counted, mark, onClick }: {
  surface: string; ns: string; icon: ReactNode; label: string; count: number; counted: boolean; mark: "true" | "location" | undefined; onClick: () => void;
}) {
  const uiLocale = useUiLocale();
  const location = mark === "location";
  const empty = counted && count === 0;
  return (
    // 30 = 소스 행의 px-2(8) + chevron(14) + gap(8) — 네임스페이스 아이콘의 왼쪽 끝을 소스 아이콘과 맞춘다(시안은 34로 4px 어긋났다, 사용자 결정).
    <ListRow as="button" variant="canvas" ringInset
      selected={mark === "true"}
      aria-current={mark}
      data-tree-surface={surface}
      data-tree-ns={ns}
      disabled={empty && mark === undefined}
      onClick={onClick}
      className={cn("flex items-center gap-2 rounded-sm py-1.5 pr-2 pl-[30px] text-sm", empty && "text-muted-foreground")}
    >
      <span className={cn("flex", location ? "text-gray-strong" : "text-gray-dim")}>{icon}</span>
      <span className={cn("min-w-0 flex-1 truncate", location && "font-medium")}>{label}</span>
      <span className={cn("text-xs", location ? "text-foreground" : "text-muted-foreground")}>{formatNumber(count, uiLocale)}</span>
    </ListRow>
  );
}
