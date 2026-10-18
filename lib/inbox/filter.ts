import { importFailureTone } from "@/lib/projects/import-failure";
import { encodeList, list, text } from "@/lib/query-list";
import type { InboxItem, InboxPlan } from "./plan";

export const INBOX_KIND_FILTERS = ["publish", "review", "untranslated", "sync_failed", "partial", "disconnected", "setup"] as const;
export type InboxKindFilter = (typeof INBOX_KIND_FILTERS)[number];
export type InboxFilter = { kind: InboxKindFilter | null; projects: string[]; q: string | null };
export type InboxSearchParams = Record<string, string | string[] | undefined>;
export type InboxFilterOptions = {
  kinds: InboxKindFilter[];
  projects: InboxPlan["groups"][number]["project"][];
};

export function inboxKindOf(item: InboxItem): InboxKindFilter {
  switch (item.kind) {
    case "unsent":
    case "language_unsent": return "publish";
    case "review": return "review";
    case "never_filled": return "untranslated";
    case "import_failed": return importFailureTone(item.reason) === "warning" ? "partial" : "sync_failed";
    case "needs_reconnect": return "disconnected";
    case "setup": return "setup";
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}

export function parseInboxFilter(params: InboxSearchParams): InboxFilter {
  const kind = text(params.kind);
  const q = text(params.q);
  return {
    kind: kind !== null && (INBOX_KIND_FILTERS as readonly string[]).includes(kind) ? kind as InboxKindFilter : null,
    projects: list(params.project),
    q: q === null ? null : normalize(q),
  };
}

export function inboxQuery(filter: InboxFilter): { kind?: string; project?: string; q?: string } {
  const project = encodeList(filter.projects);
  return {
    ...(filter.kind === null ? {} : { kind: filter.kind }),
    ...(project === undefined ? {} : { project }),
    ...(filter.q === null ? {} : { q: filter.q }),
  };
}

export function inboxFilterOptions(plan: InboxPlan): InboxFilterOptions {
  const kinds = new Set(plan.groups.flatMap(group => group.items.map(inboxKindOf)));
  return {
    kinds: INBOX_KIND_FILTERS.filter(kind => kinds.has(kind)),
    projects: plan.groups.map(group => group.project),
  };
}

export function effectiveInboxFilter(filter: InboxFilter, options: InboxFilterOptions): InboxFilter {
  const projects = new Set(options.projects.map(project => project.slug));
  return {
    kind: filter.kind !== null && options.kinds.includes(filter.kind) ? filter.kind : null,
    projects: filter.projects.filter(slug => projects.has(slug)),
    q: filter.q,
  };
}

export function hasNarrowing(filter: InboxFilter): boolean {
  return filter.kind !== null || filter.projects.length > 0 || filter.q !== null;
}

export function filterInbox(plan: InboxPlan, filter: InboxFilter): InboxPlan {
  const projects = new Set(filter.projects);
  const q = normalize(filter.q ?? "").toLowerCase();
  let unread = 0;
  const groups = plan.groups.flatMap(group => {
    if (projects.size > 0 && !projects.has(group.project.slug)) return [];
    const items = group.items.filter(item =>
      (filter.kind === null || inboxKindOf(item) === filter.kind)
      && (q === "" || [group.project.name, ...searchText(item)].some(value => normalize(value).toLowerCase().includes(q))),
    );
    if (items.length === 0) return [];
    unread += items.filter(item => item.unread).length;
    return [{ ...group, items }];
  });
  return { groups, unread };
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function searchText(item: InboxItem): string[] {
  switch (item.kind) {
    case "review":
    case "never_filled": return [item.surfaceSlug, item.name, item.code];
    case "import_failed":
    case "unsent":
    case "language_unsent": return [item.surfaceSlug];
    case "needs_reconnect":
    case "setup": return [];
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}
