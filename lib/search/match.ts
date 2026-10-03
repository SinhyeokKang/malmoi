import type { ComponentType } from "react";

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
  /** Pages 행의 글리프 — 같은 목적지의 nav 항목 아이콘이다(`nav-index.ts`가 싣는다). 다른 그룹은 `rows.ts`가 정한다. */
  icon?: ComponentType<{ className?: string }>;
};

export type SearchIndex = {
  projects: readonly SearchEntry[];
  pages: readonly SearchEntry[];
  docs: readonly SearchEntry[];
  authenticated: boolean;
};
export type SearchGroup = { kind: "projects" | "pages" | "docs"; items: SearchEntry[] };
type MatchField = "title" | "context" | "body";

/**
 * 검색 상수 — 서버 `lib/keys/search.ts`도 이것을 import한다(서버가 클라이언트 잎을 무는 허용 방향).
 * ⚠️ 이 파일은 import 0인 잎이다 — 상수 정의만 두고 import를 늘리지 않는다.
 */
export const KEY_QUERY_MIN = 2;
export const SEARCH_GROUP_LIMIT = 5;

export function searchTokens(q: string): string[] {
  return [...new Set(q.trim().toLowerCase().split(/\s+/).filter(Boolean))];
}

/**
 * 프로젝트 이름 대조의 정본 — 검색 Projects·`/projects`·LNB 스위처가 같은 규칙이다(search-ux-unify D1).
 * `tokens`는 `searchTokens(q)`의 출력이다. 토큰이 없으면 참(빈 질의는 전부).
 */
export function matchesAllTokens(text: string, tokens: readonly string[]): boolean {
  const folded = text.toLowerCase();
  return tokens.every(token => folded.includes(token));
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
  return (["projects", "pages", "docs"] as const).flatMap(kind => {
    const items = index[kind].flatMap((entry, order) => {
      // Project slugs are display context; Projects searches the name only (spec 9).
      const match = scoreEntry(kind === "projects" ? { ...entry, context: undefined, body: undefined } : entry, tokens);
      return match === null ? [] : [{ entry, order, score: match.score }];
    }).sort((a, b) => b.score - a.score || Number(b.entry.slug === activeSlug) - Number(a.entry.slug === activeSlug)
      // 점수가 같으면 보관이 뒤로 간다 — 스위처·미리보기와 같은 규칙(search-ux-unify C8).
      || Number(!!a.entry.archived) - Number(!!b.entry.archived) || a.order - b.order)
      .slice(0, SEARCH_GROUP_LIMIT).map(row => row.entry);
    return items.length === 0 ? [] : [{ kind, items }];
  });
}

/**
 * 빈 질의 미리보기 — 그룹마다 앞 셋이다. 출구 행(`Go to your projects`·`Go to docs`)은 문구·경로라 `rows.ts`가 붙인다
 * (이 파일은 import 0인 잎이라 사전·routes를 물지 않는다).
 */
export function previewGroups(index: SearchIndex, { activeSlug }: { activeSlug: string | null }): SearchGroup[] {
  const groups: SearchGroup[] = [];
  const projects = [...index.projects].sort((a, b) => Number(b.slug === activeSlug) - Number(a.slug === activeSlug) || Number(!!a.archived) - Number(!!b.archived));
  if (index.authenticated && projects.length > 0) groups.push({ kind: "projects", items: projects.slice(0, 3) });
  const projectSlug = projects[0]?.slug;
  const pages = projectSlug === undefined ? index.pages : index.pages.filter(entry => entry.slug === projectSlug);
  if (pages.length > 0) groups.push({ kind: "pages", items: pages.slice(0, 3) });
  groups.push({ kind: "docs", items: index.docs.filter(entry => entry.anchor == null).slice(0, 3) });
  return groups;
}
