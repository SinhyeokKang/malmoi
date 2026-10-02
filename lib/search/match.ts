export type SearchEntry = {
  id: string;
  title: string;
  href: string;
  context?: string;
  body?: string;
  slug?: string;
  archived?: boolean;
  image?: string | null;
  anchor?: string | null;
};

export type SearchIndex = {
  projects: readonly SearchEntry[];
  menus: readonly SearchEntry[];
  docs: readonly SearchEntry[];
  authenticated: boolean;
};
export type SearchGroup = { kind: "projects" | "menus" | "docs"; items: SearchEntry[] };
type MatchField = "title" | "context" | "body";

export function searchTokens(q: string): string[] {
  return [...new Set(q.trim().toLowerCase().split(/\s+/).filter(Boolean))];
}

export function scoreEntry(entry: SearchEntry, tokens: readonly string[]): { score: number; fields: MatchField[] } | null {
  if (tokens.length === 0) return null;
  const fields: MatchField[] = [];
  let score = 0;
  const values = { title: entry.title.toLowerCase(), context: entry.context?.toLowerCase() ?? "", body: entry.body?.toLowerCase() ?? "" };
  for (const token of tokens) {
    let found = false;
    for (const field of ["title", "context", "body"] as const) {
      if (!values[field].includes(token)) continue;
      found = true;
      if (!fields.includes(field)) fields.push(field);
      score = Math.max(score, field === "title" ? (values.title.startsWith(token) ? 4 : 3) : field === "context" ? 2 : 1);
    }
    if (!found) return null;
  }
  return { score, fields };
}

export function searchGroups(index: SearchIndex, q: string, { activeSlug }: { activeSlug: string | null }): SearchGroup[] {
  const tokens = searchTokens(q);
  if (tokens.length === 0) return [];
  return (["projects", "menus", "docs"] as const).flatMap(kind => {
    const items = index[kind].flatMap((entry, order) => {
      // Project slugs are display context; Projects searches the name only (spec 9).
      const match = scoreEntry(kind === "projects" ? { ...entry, context: undefined, body: undefined } : entry, tokens);
      return match === null ? [] : [{ entry, order, score: match.score }];
    }).sort((a, b) => b.score - a.score || Number(b.entry.slug === activeSlug) - Number(a.entry.slug === activeSlug) || a.order - b.order)
      .slice(0, 5).map(row => row.entry);
    return items.length === 0 ? [] : [{ kind, items }];
  });
}

export function previewGroups(index: SearchIndex, { activeSlug }: { activeSlug: string | null }): SearchGroup[] {
  const groups: SearchGroup[] = [];
  const projects = [...index.projects].sort((a, b) => Number(b.slug === activeSlug) - Number(a.slug === activeSlug) || Number(!!a.archived) - Number(!!b.archived));
  if (index.authenticated && projects.length > 0) {
    groups.push({ kind: "projects", items: [...projects.slice(0, 3), { id: "view-all-projects", title: "View all projects", href: "/projects" }] });
  }
  const projectSlug = projects[0]?.slug;
  const menus = projectSlug === undefined ? index.menus : index.menus.filter(entry => entry.slug === projectSlug);
  if (menus.length > 0) groups.push({ kind: "menus", items: menus.slice(0, 3) });
  groups.push({ kind: "docs", items: [...index.docs.filter(entry => entry.anchor == null).slice(0, 3), { id: "browse-all-docs", title: "Browse all docs", href: "/docs" }] });
  return groups;
}
