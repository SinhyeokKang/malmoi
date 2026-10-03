/**
 * `Icon`은 Pages 행 글리프의 타입이다 — 이 파일은 import 0인 잎이라 React 타입을 들이지 않고 소비자(`nav-index`·`rows`)가 채운다.
 * 기본 `never`라 아이콘이 없는 Docs(JSON)·Projects 항목이 어느 색인에도 그대로 들어간다.
 */
export type SearchEntry<Icon = never> = {
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
  icon?: Icon;
};

export type SearchIndex<Icon = never> = {
  projects: readonly SearchEntry<Icon>[];
  pages: readonly SearchEntry<Icon>[];
  docs: readonly SearchEntry<Icon>[];
  authenticated: boolean;
};
export type SearchGroup<Icon = never> = { kind: "projects" | "pages" | "docs"; items: SearchEntry<Icon>[] };
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

export function scoreEntry<Icon>(entry: SearchEntry<Icon>, tokens: readonly string[]): { score: number; fields: MatchField[] } | null {
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

export function searchGroups<Icon>(index: SearchIndex<Icon>, q: string, { activeSlug }: { activeSlug: string | null }): SearchGroup<Icon>[] {
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
 * 빈 질의 미리보기의 순서·거르기 — 현재·비보관 우선 프로젝트, 첫 프로젝트의 Pages, 문서 도입부. **자르지 않는다** — 상한은
 * `rows.ts`의 `PREVIEW_LIMIT` 하나가 든다(상수가 둘이면 리터럴 쪽이 이긴다). 출구 행(`Go to your projects`·`Go to docs`)은
 * 문구·경로라 `rows.ts`가 붙인다(이 파일은 import 0인 잎이라 사전·routes를 물지 않는다).
 */
export function previewGroups<Icon>(index: SearchIndex<Icon>, { activeSlug }: { activeSlug: string | null }): SearchGroup<Icon>[] {
  const groups: SearchGroup<Icon>[] = [];
  const projects = [...index.projects].sort((a, b) => Number(b.slug === activeSlug) - Number(a.slug === activeSlug) || Number(!!a.archived) - Number(!!b.archived));
  if (index.authenticated && projects.length > 0) groups.push({ kind: "projects", items: projects });
  const projectSlug = projects[0]?.slug;
  const pages = projectSlug === undefined ? index.pages : index.pages.filter(entry => entry.slug === projectSlug);
  if (pages.length > 0) groups.push({ kind: "pages", items: [...pages] });
  groups.push({ kind: "docs", items: index.docs.filter(entry => entry.anchor == null) });
  return groups;
}
