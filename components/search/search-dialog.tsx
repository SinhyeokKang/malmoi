"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useUiLocale } from "@/components/i18n/messages-provider";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandStatus } from "@/components/ui/command";
import { CommandDialog } from "@/components/ui/dialog";
import { NoMatch } from "@/components/ui/empty-state";
import { Highlight } from "@/components/ui/highlight";
import { IconTile } from "@/components/ui/icon-tile";
import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { StatusBadge } from "@/components/ui/status-badge";
import { searchKeysAction, type SearchMembershipsResult } from "@/app/search/actions";
import type { PublicAccount } from "@/lib/auth/landing";
import { m } from "@/lib/i18n";
import { isPlainPrimaryClick } from "@/lib/keyboard";
import { landDocumentHeading } from "@/lib/public-doc/landing";
import type { KeyHit } from "@/lib/search/key-href";
import { loadSearchIndex } from "@/lib/search/load-index";
import { loadSearchMemberships } from "@/lib/search/load-memberships";
import type { SearchEntry } from "@/lib/search/match";
import { navSearchEntries } from "@/lib/search/nav-index";
import { keySearchText, searchRows, searchStatuses, type SearchTile } from "@/lib/search/rows";
import { activeProject, type NavProject } from "@/lib/shell/nav";

type KeyFailure = "unauthorized" | "unavailable";

function Tile({ tile }: { tile: SearchTile }) {
  if (tile.kind === "project") return <ProjectThumbnail name={tile.name} src={tile.image} size="sm" />;
  const Icon = tile.icon;
  return <IconTile size="sm"><Icon /></IconTile>;
}

export function SearchDialog({ open, onOpenChange, account, memberships }: {
  open: boolean; onOpenChange: (open: boolean) => void; account: PublicAccount | null; memberships?: readonly NavProject[];
}) {
  const pathname = usePathname();
  const uiLocale = useUiLocale();
  const [q, setQuery] = useState("");
  const [publicMemberships, setPublicMemberships] = useState<SearchMembershipsResult | null>(null);
  const [docs, setDocs] = useState<SearchEntry[]>([]);
  const [docsState, setDocsState] = useState<"loading" | "ready" | "failed">("loading");
  const [keys, setKeys] = useState<{ query: string; hits: KeyHit[]; error: KeyFailure | null }>({ query: "", hits: [], error: null });
  const [keysLoading, setKeysLoading] = useState(false);
  // This instance belongs to one opening; reuse only its in-flight request during StrictMode effect replay.
  const membershipRequest = useRef<ReturnType<typeof loadSearchMemberships> | null>(null);
  const keyGeneration = useRef(0);
  const heading = useRef<string | null>(null);
  const needsMemberships = memberships === undefined && account !== null;
  // 멤버십 실패를 비로그인으로 접지 않는다 — 색인은 Docs 전용이 되고 상태 줄이 이유를 말한다(C1).
  const loaded = publicMemberships?.ok ? publicMemberships.memberships : null;
  const currentMemberships = account === null ? null : memberships ?? loaded;
  const membershipState = !needsMemberships ? "ready" : publicMemberships === null ? "loading" : publicMemberships.ok ? "ready" : publicMemberships.error;
  const activeSlug = memberships === undefined ? null : activeProject(pathname, memberships)?.slug ?? null;
  const nav = navSearchEntries(currentMemberships, { activeSlug, userName: account?.name ?? "" });
  const keyQuery = keySearchText(q, nav.authenticated);
  const canSearchKeys = keyQuery !== null;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadSearchIndex(uiLocale).then(entries => { if (alive) { setDocs(entries); setDocsState("ready"); } }, () => { if (alive) setDocsState("failed"); });
    return () => { alive = false; };
  }, [open, uiLocale]);
  useEffect(() => {
    if (!open || !needsMemberships) return;
    let alive = true;
    membershipRequest.current ??= loadSearchMemberships();
    void membershipRequest.current.then(result => { if (alive) setPublicMemberships(result); });
    return () => { alive = false; };
  }, [open, needsMemberships]);
  useEffect(() => {
    const generation = ++keyGeneration.current;
    if (!open || keyQuery === null) { setKeysLoading(false); return; }
    setKeysLoading(true);
    const timer = setTimeout(() => {
      void searchKeysAction(keyQuery, activeSlug).then(result => {
        if (generation !== keyGeneration.current) return;
        setKeys({ query: q, hits: result.ok ? result.hits : [], error: result.ok ? null : result.error });
        setKeysLoading(false);
      }, () => {
        if (generation !== keyGeneration.current) return;
        setKeys({ query: q, hits: [], error: "unavailable" });
        setKeysLoading(false);
      });
    }, 250);
    return () => { clearTimeout(timer); ++keyGeneration.current; };
  }, [open, keyQuery, activeSlug, q]);

  const keysCurrent = canSearchKeys && !keysLoading && keys.query === q;
  const { groups, ids } = searchRows({ index: { ...nav, docs }, keys: keysCurrent ? keys.hits : [], q, activeSlug });
  const status = searchStatuses({
    membership: membershipState, docs: docsState,
    keys: !canSearchKeys ? "idle" : !keysCurrent ? "loading" : keys.error ?? "ready",
  });
  const navigate = (href: string) => (event: MouseEvent) => {
    // Modified clicks retain browser new-tab behavior and leave the current search usable.
    if (!isPlainPrimaryClick(event)) return;
    const url = new URL(href, window.location.href);
    if (url.pathname.startsWith("/docs") && url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search && url.hash) {
      const id = decodeURIComponent(url.hash.slice(1));
      if (document.getElementById(id)?.closest("[data-public-scroller]")) { event.preventDefault(); heading.current = id; }
    }
    // window capture precedes the workspace document guard; React batches both dialog states.
    onOpenChange(false);
  };
  return <CommandDialog open={open} onOpenChange={onOpenChange} title={m.search.label}
    onCloseAutoFocus={event => { if (heading.current !== null) { event.preventDefault(); landDocumentHeading(heading.current); heading.current = null; } }}>
    <Command ids={ids} query={q}>
      <CommandInput value={q} onValueChange={value => { ++keyGeneration.current; setKeys({ query: "", hits: [], error: null }); setQuery(value); }} label={m.search.label} placeholder={m.search.placeholder} />
      <CommandStatus lines={status.lines} />
      {/* 0건은 목록 슬롯 맨 위에 선다. 조회가 실패했으면 "결과 없음"이 거짓이라 그리지 않는다(C3).
          listbox 밖 형제라 목록의 위 여백(`py-2`의 8)을 `mt-2`로 직접 든다 — 없으면 시안보다 8 위다(#177). */}
      {ids.length === 0 && !status.pending && !status.failed && <NoMatch placement="inset" className="mt-2" title={m.search.noResults(q)} description={m.search.noResultsDescription} />}
      <CommandList label={m.search.label}>
        {groups.map(group => <CommandGroup key={group.kind} heading={group.heading}>
          {group.rows.map(row => <CommandItem key={row.id} id={row.id} href={row.href} icon={<Tile tile={row.tile} />}
            title={<Highlight segments={row.title} />}
            context={row.context === undefined ? undefined : <Highlight segments={row.context} />}
            description={row.description === undefined ? undefined : <>{row.locale !== undefined && <><span data-search-locale>{row.locale}</span>{" · "}</>}<Highlight segments={row.description} /></>}
            badge={row.archived ? <StatusBadge state="archived" /> : undefined}
            onNavigate={navigate(row.href)} />)}
        </CommandGroup>)}
      </CommandList>
    </Command>
  </CommandDialog>;
}
