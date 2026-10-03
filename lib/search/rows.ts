import type { ComponentType } from "react";

import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { navFooterItems, navWorkItems, projectSections } from "@/lib/shell/nav";
import { Q_MAX_LENGTH } from "@/lib/translations/query";

import { highlightSegments, snippet } from "./highlight";
import { keyResultHref, type KeyHit } from "./key-href";
import { KEY_QUERY_MIN, previewGroups, searchGroups, searchTokens, type SearchEntry, type SearchIndex } from "./match";

/**
 * **검색 Dialog의 뷰모델** (search-ux-unify C26) — 그룹 순서·행·`ids`·상태 줄을 한 곳에서 낸다. 컴포넌트는 그리기만 한다.
 * ⚠️ `ids`는 렌더할 그룹 행에서 뽑는다 — 순서를 두 번 계산하면 ↑↓와 화면이 갈린다.
 * 행 모델에 ReactNode는 없다: 글자는 강조 조각, 타일은 컴포넌트 참조라 테스트가 `toBe(Box)`로 잰다.
 */

const PREVIEW_LIMIT = 3;
const SNIPPET_LENGTH = 160;

type Glyph = ComponentType<{ className?: string }>;
export type SearchSegments = readonly { text: string; match: boolean }[];
export type SearchTile = { kind: "project"; name: string; image: string | null } | { kind: "glyph"; icon: Glyph };
export type SearchRow = {
  id: string;
  href: string;
  title: SearchSegments;
  context?: SearchSegments;
  description?: SearchSegments;
  /** Keys 행 설명 앞의 로케일 코드 — 원문 일치면 없다. */
  locale?: string;
  tile: SearchTile;
  archived: boolean;
};
export type SearchRowGroup = { kind: "projects" | "pages" | "keys" | "docs"; heading: string; rows: SearchRow[] };

/**
 * 글리프는 같은 목적지의 nav 항목에서 **key로** 꺼낸다(C17) — href로 찾지 않는다(Keys href엔 쿼리, Docs href엔 해시가 붙는다).
 * 호출마다 계산한다: `m`·nav는 모듈 최상위에서 평가하지 않는다.
 */
function glyphs(): { projects: Glyph; keys: Glyph; docs: Glyph } {
  const projects = navWorkItems().find(item => item.key === "projects")?.icon;
  const keys = projectSections("OWNER").find(section => section.key === "translations")?.icon;
  const docs = navFooterItems().find(item => item.key === "docs")?.icon;
  if (!projects || !keys || !docs) throw new Error("search rows: nav item missing for a search glyph");
  return { projects, keys, docs };
}

const plain = (text: string): SearchSegments => [{ text, match: false }];

/**
 * Keys를 요청할 질의 — 서버 `keySearchQuery`(`lib/keys/search.ts`)와 같은 판정이다: trim → `Q_MAX_LENGTH` 절단 → 길이 하한.
 * ⚠️ 길이는 UTF-16 단위다(서버와 같다) — 서로게이트 쌍 1글자도 요청한다.
 */
export function keySearchText(q: string, authenticated: boolean): string | null {
  const query = q.trim().slice(0, Q_MAX_LENGTH);
  return authenticated && query.length >= KEY_QUERY_MIN ? query : null;
}

export function searchRows({ index, keys, q, activeSlug }: { index: SearchIndex<Glyph>; keys: readonly KeyHit[]; q: string; activeSlug: string | null }): { groups: SearchRowGroup[]; ids: string[] } {
  const icon = glyphs();
  const tokens = searchTokens(q);
  const mark = (text: string, parts: readonly string[] = tokens): SearchSegments => highlightSegments(text, parts);
  const entryRow = (kind: "projects" | "pages" | "docs", entry: SearchEntry<Glyph>): SearchRow => ({
    id: entry.id,
    href: entry.href,
    title: mark(entry.title),
    // Projects는 이름만 찾는다 — slug 맥락을 칠하면 찾지 않은 필드가 맞은 것처럼 보인다(C7).
    ...(entry.context === undefined ? {} : { context: kind === "projects" ? plain(entry.context) : mark(entry.context) }),
    ...(kind === "docs" && entry.body ? { description: mark(snippet(entry.body, tokens, SNIPPET_LENGTH) ?? entry.body.slice(0, SNIPPET_LENGTH)) } : {}),
    tile: kind === "projects" ? { kind: "project", name: entry.title, image: entry.image ?? null }
      : { kind: "glyph", icon: kind === "docs" ? icon.docs : entry.icon ?? icon.docs },
    archived: !!entry.archived,
  });
  const exit = (id: string, title: string, href: string, glyph: Glyph): SearchRow => ({ id, href, title: plain(title), tile: { kind: "glyph", icon: glyph }, archived: false });

  const groups: SearchRowGroup[] = [];
  const push = (kind: SearchRowGroup["kind"], rows: SearchRow[]) => { if (rows.length > 0) groups.push({ kind, heading: m.search.groups[kind], rows }); };
  if (tokens.length === 0) {
    // `/docs`(개요) 항목은 미리보기에 싣지 않는다 — 그 자리는 `Go to docs` 하나다(D8).
    const preview = previewGroups({ ...index, docs: index.docs.filter(entry => entry.href !== routes.docs()) }, { activeSlug });
    for (const group of preview) {
      const rows = group.items.slice(0, PREVIEW_LIMIT).map(entry => entryRow(group.kind, entry));
      if (group.kind === "projects") rows.push(exit("go-to-projects", m.notFound.action, routes.projects(), icon.projects));
      if (group.kind === "docs") rows.push(exit("go-to-docs", m.search.goToDocs, routes.docs(), icon.docs));
      push(group.kind, rows);
    }
  } else {
    const found = searchGroups(index, q, { activeSlug });
    const rowsOf = (kind: "projects" | "pages" | "docs") => found.find(group => group.kind === kind)?.items.map(entry => entryRow(kind, entry)) ?? [];
    const keyQuery = keySearchText(q, index.authenticated);
    // Keys는 질의 전체를 한 덩어리로 찾는다(토큰 AND가 아니다) — 칠하는 조각도 같다.
    const parts = keyQuery === null ? [] : [keyQuery];
    push("projects", rowsOf("projects"));
    push("pages", rowsOf("pages"));
    push("keys", keyQuery === null ? [] : keys.map(hit => {
      const text = hit.value ?? hit.sourceText;
      return {
        id: `key:${hit.id}`,
        href: keyResultHref(hit),
        title: mark(hit.key, parts),
        // 프로젝트·소스는 찾지 않은 필드라 칠하지 않는다(C7).
        context: plain(`${hit.name} · ${hit.surfaceSlug}`),
        description: mark(snippet(text, parts, SNIPPET_LENGTH) ?? text.slice(0, SNIPPET_LENGTH), parts),
        ...(hit.localeCode === null ? {} : { locale: hit.localeCode }),
        tile: { kind: "glyph", icon: icon.keys },
        archived: false,
      };
    }));
    push("docs", rowsOf("docs"));
  }
  return { groups, ids: groups.flatMap(group => group.rows.map(row => row.id)) };
}

type Load = "loading" | "ready";
type Failure = "unauthorized" | "unavailable";

/**
 * 상태 줄 — 로딩은 muted, 실패는 danger다(C3). `failed`면 컴포넌트가 0건(`NoMatch`)을 그리지 않는다 — 조회가 실패했는데
 * "결과 없음"을 말하면 거짓이다. 세션 종료는 실패 종류와 무관하게 같은 문장이다(C2).
 */
export function searchStatuses({ membership, docs, keys }: {
  membership: Load | Failure; docs: Load | "failed"; keys: "idle" | Load | Failure;
}): { pending: boolean; lines: { tone: "muted" | "danger"; text: string }[]; failed: boolean } {
  const lines: { tone: "muted" | "danger"; text: string }[] = [];
  if (membership === "loading") lines.push({ tone: "muted", text: m.projects.loading });
  // 세션 종료는 무엇이 알아챘든 한 번만 말한다 — 같은 문장 두 줄은 줄 key도 겹친다.
  if (membership === "unauthorized" || keys === "unauthorized") lines.push({ tone: "danger", text: m.search.sessionEnded });
  if (membership === "unavailable") lines.push({ tone: "danger", text: m.search.projectsUnavailable });
  // 줄 순서는 그룹 순서(Projects → Pages → Keys → Docs)다 — 실패 줄이 아래 결과 그룹과 같은 차례로 읽힌다(#175).
  if (keys === "loading") lines.push({ tone: "muted", text: m.search.loadingKeys });
  if (keys === "unavailable") lines.push({ tone: "danger", text: m.search.keysUnavailable });
  if (docs === "loading") lines.push({ tone: "muted", text: m.search.loadingDocs });
  if (docs === "failed") lines.push({ tone: "danger", text: m.search.docsUnavailable });
  return { pending: lines.some(line => line.tone === "muted"), lines, failed: lines.some(line => line.tone === "danger") };
}
