"use client";

import { BookOpen, Folder } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandStatus } from "@/components/ui/command";
import { CommandDialog } from "@/components/ui/dialog";
import { NoMatch } from "@/components/ui/empty-state";
import { Highlight } from "@/components/ui/highlight";
import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { searchKeysAction } from "@/app/search/actions";
import type { PublicAccount } from "@/lib/auth/landing";
import { m } from "@/lib/i18n";
import { landDocumentHeading } from "@/lib/public-doc/landing";
import { highlightSegments, snippet } from "@/lib/search/highlight";
import { keyResultHref, type KeyHit } from "@/lib/search/key-href";
import { loadSearchIndex } from "@/lib/search/load-index";
import { loadSearchMemberships } from "@/lib/search/load-memberships";
import { previewGroups, searchGroups, searchTokens, type SearchEntry } from "@/lib/search/match";
import { navSearchEntries } from "@/lib/search/nav-index";
import { activeProject, type NavProject } from "@/lib/shell/nav";
import { Q_MAX_LENGTH } from "@/lib/translations/query";

export function SearchDialog({ open, onOpenChange, account, memberships }: {
  open: boolean; onOpenChange: (open: boolean) => void; account: PublicAccount | null; memberships?: readonly NavProject[];
}) {
  const pathname = usePathname();
  const [q, setQuery] = useState("");
  const [publicMemberships, setPublicMemberships] = useState<readonly NavProject[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(account !== null && memberships === undefined);
  const [docs, setDocs] = useState<SearchEntry[]>([]);
  const [docsState, setDocsState] = useState<"loading" | "ready" | "failed">("loading");
  const [keys, setKeys] = useState<{ query: string; hits: KeyHit[]; failed: boolean }>({ query: "", hits: [], failed: false });
  const [keysLoading, setKeysLoading] = useState(false);
  // This instance belongs to one opening; reuse only its in-flight request during StrictMode effect replay.
  const membershipRequest = useRef<ReturnType<typeof loadSearchMemberships> | null>(null);
  const keyGeneration = useRef(0);
  const composing = useRef(false);
  const heading = useRef<string | null>(null);
  const currentMemberships = account === null ? null : memberships ?? publicMemberships;
  const activeSlug = memberships === undefined ? null : activeProject(pathname, memberships)?.slug ?? null;
  const nav = navSearchEntries(currentMemberships, { activeSlug, userName: account?.name ?? "" });
  const trimmed = q.trim();
  const keyQuery = trimmed.slice(0, Q_MAX_LENGTH);
  const canSearchKeys = nav.authenticated && keyQuery.length >= 2;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadSearchIndex().then(entries => { if (alive) { setDocs(entries); setDocsState("ready"); } }, () => { if (alive) setDocsState("failed"); });
    return () => { alive = false; };
  }, [open]);
  const needsMemberships = memberships === undefined && account !== null;
  useEffect(() => {
    if (!open || !needsMemberships) return;
    let alive = true;
    membershipRequest.current ??= loadSearchMemberships();
    void membershipRequest.current.then(rows => { if (alive) { setPublicMemberships(rows); setMembersLoading(false); } });
    return () => { alive = false; };
  }, [open, needsMemberships]);
  useEffect(() => {
    const generation = ++keyGeneration.current;
    if (!open || !canSearchKeys) { setKeysLoading(false); return; }
    setKeysLoading(true);
    const timer = setTimeout(() => {
      void searchKeysAction(keyQuery, activeSlug).then(result => {
        if (generation !== keyGeneration.current) return;
        setKeys({ query: q, hits: result.ok ? result.hits : [], failed: !result.ok });
        setKeysLoading(false);
      }, () => {
        if (generation !== keyGeneration.current) return;
        setKeys({ query: q, hits: [], failed: true });
        setKeysLoading(false);
      });
    }, 250);
    return () => { clearTimeout(timer); ++keyGeneration.current; };
  }, [open, canSearchKeys, keyQuery, activeSlug, q]);

  const index = { ...nav, docs };
  const groups = trimmed === "" ? previewGroups(index, { activeSlug }) : searchGroups(index, q, { activeSlug });
  const keyHits = canSearchKeys && keys.query === q ? keys.hits : [];
  const ordered = ["projects", "menus", "keys", "docs"] as const;
  const ids = ordered.flatMap(kind => kind === "keys" ? keyHits.map(hit => `key:${hit.id}`) : groups.find(group => group.kind === kind)?.items.map(entry => entry.id) ?? []);
  const tokens = searchTokens(q);
  const highlighted = (text: string, parts = tokens) => <Highlight segments={highlightSegments(text, parts)} />;
  const navigate = (href: string) => (event: MouseEvent) => {
    // Modified clicks retain browser new-tab behavior and leave the current search usable.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(href, window.location.href);
    if (url.pathname.startsWith("/docs") && url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search && url.hash) {
      const id = decodeURIComponent(url.hash.slice(1));
      if (document.getElementById(id)?.closest("[data-public-scroller]")) { event.preventDefault(); heading.current = id; }
    }
    // window capture precedes the workspace document guard; React batches both dialog states.
    onOpenChange(false);
  };
  const pending = (needsMemberships && membersLoading) || docsState === "loading" || (canSearchKeys && (keysLoading || keys.query !== q));
  const statuses = [needsMemberships && membersLoading && m.search.loadingProjects, docsState === "loading" && m.search.loadingDocs, docsState === "failed" && m.search.docsUnavailable,
    canSearchKeys && (keysLoading || keys.query !== q) && m.search.loadingKeys, canSearchKeys && keys.query === q && keys.failed && m.search.keysUnavailable].filter(Boolean);

  return <CommandDialog open={open} onOpenChange={onOpenChange} title={m.search.label}
    onEscapeKeyDown={event => { if (composing.current || event.isComposing || event.keyCode === 229) event.preventDefault(); }}
    onCloseAutoFocus={event => { if (heading.current !== null) { event.preventDefault(); landDocumentHeading(heading.current); heading.current = null; } }}>
    <div className="flex min-h-0 flex-1 flex-col" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
      <Command ids={ids} query={q}>
        <CommandInput value={q} onValueChange={value => { ++keyGeneration.current; setKeys({ query: "", hits: [], failed: false }); setQuery(value); }} label={m.search.label} placeholder={m.search.placeholder} />
        {statuses.map(status => <CommandStatus key={String(status)}>{status}</CommandStatus>)}
        <CommandList label={m.search.label}>
          {ordered.map(kind => {
            if (kind === "keys") return keyHits.length === 0 ? null : <CommandGroup key={kind} heading={m.search.groups.keys}>
              {keyHits.map(hit => {
                const parts = [keyQuery];
                const text = hit.value ?? hit.sourceText;
                const description = snippet(text, parts, 160) ?? text.slice(0, 160);
                const href = keyResultHref(hit);
                return <CommandItem key={hit.id} id={`key:${hit.id}`} href={href} title={highlighted(hit.key, parts)} context={highlighted(`${hit.name} · ${hit.surfaceSlug}`, parts)}
                  description={<>{hit.localeCode !== null && <><span data-search-locale>{hit.localeCode}</span>{" · "}</>}{highlighted(description, parts)}</>} onNavigate={navigate(href)} />;
              })}
            </CommandGroup>;
            const entries = groups.find(group => group.kind === kind)?.items;
            return !entries?.length ? null : <CommandGroup key={kind} heading={m.search.groups[kind]}>
              {entries.map(entry => <CommandItem key={entry.id} id={entry.id} href={entry.href}
                title={highlighted(entry.id === "view-all-projects" ? m.search.viewAllProjects : entry.id === "browse-all-docs" ? m.search.browseAllDocs : entry.title)}
                context={entry.context === undefined ? undefined : highlighted(entry.context)}
                icon={entry.id === "view-all-projects" ? <Folder /> : entry.id === "browse-all-docs" ? <BookOpen /> : kind === "projects" ? <ProjectThumbnail name={entry.title} src={entry.image} /> : undefined}
                badge={entry.archived ? <Badge>{m.projects.archived}</Badge> : undefined}
                description={kind === "docs" && entry.body ? highlighted(snippet(entry.body, tokens, 160) ?? entry.body.slice(0, 160)) : undefined}
                onNavigate={navigate(entry.href)} />)}
            </CommandGroup>;
          })}
        </CommandList>
        {ids.length === 0 && !pending && <NoMatch placement="inset" title={m.search.noResults(q)} description={m.search.noResultsDescription} />}
      </Command>
    </div>
  </CommandDialog>;
}
