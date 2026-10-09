import { docHref } from "@/lib/guide/href";
import { headingAnchor, parseMd } from "@/lib/guide/parse";
import { flattenNav, type NavNode } from "@/lib/guide/summary";
import { docsSearchEntries } from "@/lib/search/docs-index";
import { searchGroups, searchTokens } from "@/lib/search/match";
import { absoluteGuideLinks } from "@/lib/seo/llms";
import { en } from "@/messages/en";

import type { ToolOutcome } from "./result";

/**
 * MCP `read_docs`의 순수 판정 (mcp-docs design). 원고 읽기(fs)는 도구 껍데기가 하고 여기는 문자열만 받는다.
 *
 * ⚠️ **절 단위는 검색 색인(`docsSearchEntries`)과 같아야 한다** — 검색 결과에 원고 조각을 `(page, anchor)`로 붙이므로, 한쪽만 다른
 * 규칙(H1 건너뛰기·id 없는 H2 버리기)을 쓰면 결과의 markdown이 빈다. 실물 원고 동치는 `docs.test.ts`가 잰다.
 * ⚠️ `page`는 남이 준 문자열이다 — SUMMARY 평탄 목록에서 `find`로만 찾는다(객체 키 조회 금지, POSTMORTEM 2026-09-08). 입력이
 * 파일 경로로 닿지 않는다.
 */

export type DocsSlice = { anchor: string | null; markdown: string };
export type DocsReadInput = { page?: string; query?: string };

/**
 * 원고 → 절 조각. 첫 조각은 첫 H2 전 도입부(`anchor: null`, 비어도 선다)이고 H1 노드만 뺀다. id 없는 H2 절은 버린다. 노드 사이
 * 공백까지 원문 바이트로 자르므로 표·코드 블록이 그대로 남는다.
 */
export function sectionSlices(source: string): DocsSlice[] {
  const children = parseMd(source).children;
  const slices: { anchor: string | null; parts: string[] }[] = [{ anchor: null, parts: [] }];
  let current: (typeof slices)[number] | undefined = slices[0];
  children.forEach((node, i) => {
    const start = node.position?.start.offset ?? 0;
    // 다음 노드 시작까지가 이 노드의 몫이다 — H1을 뺄 때 뒤 공백도 같이 빠진다.
    const end = children[i + 1]?.position?.start.offset ?? source.length;
    if (node.type === "heading" && node.depth === 1) return;
    if (node.type === "heading" && node.depth === 2) {
      const { id } = headingAnchor(node);
      current = id === null ? undefined : { anchor: id, parts: [] };
      if (current) slices.push(current);
    }
    current?.parts.push(source.slice(start, end));
  });
  return slices.map(({ anchor, parts }) => ({ anchor, markdown: parts.join("").trim() }));
}

const withOrigin = (origin: string | null, href: string) => `${origin ?? ""}${href}`;

/** 세 갈래 — `{}` 목차 · `{ page }` 전문 · `{ query }` 절 검색. 갈래는 키 존재로 가른다(Overview의 `page`가 `""`이다). */
export function planDocsRead(nav: readonly NavNode[], sources: ReadonlyMap<string, string>, input: DocsReadInput, origin: string | null): ToolOutcome {
  if (input.page !== undefined && input.query !== undefined) return { status: "invalid-input" };
  const flat = flattenNav(nav);
  const sourceOf = (file: string) => sources.get(file) ?? "";
  // 전 페이지 파싱이다 — `{ page }` 갈래는 한 파일만 보므로 색인이 필요한 갈래에서만 만든다.
  const index = () => docsSearchEntries(nav, (file) => parseMd(sourceOf(file)));

  if (input.page !== undefined) {
    const item = flat.find(({ slug }) => slug.join("/") === input.page);
    if (item === undefined) return { status: "refused", code: "not-found", message: en.mcp.errors["docs-page-not-found"] };
    return {
      status: "ok",
      data: { page: input.page, title: item.title, url: withOrigin(origin, docHref(item.slug)), markdown: absoluteGuideLinks(sourceOf(item.file), item.file, origin) },
      summary: en.mcp.summary.guidePage(item.title),
    };
  }

  if (input.query !== undefined) {
    const query = input.query;
    // zod `min(1)`은 공백만 있는 값을 통과시킨다 — 그대로 두면 "검색어 없음"과 "0건"이 같은 응답이 된다.
    if (searchTokens(query).length === 0) return { status: "invalid-input" };
    const entries = index();
    const hits = searchGroups({ projects: [], pages: [], docs: entries, authenticated: false }, query, { activeSlug: null })
      .find((group) => group.kind === "docs")?.items ?? [];
    const slicesOf = new Map<string, DocsSlice[]>();
    const results = hits.flatMap((hit) => {
      const entry = entries.find((e) => e.id === hit.id);
      const item = entry && flat.find(({ slug }) => slug.join("/") === entry.page);
      if (!entry || !item) return [];
      if (!slicesOf.has(item.file)) slicesOf.set(item.file, sectionSlices(absoluteGuideLinks(sourceOf(item.file), item.file, origin)));
      const markdown = slicesOf.get(item.file)?.find((slice) => slice.anchor === entry.anchor)?.markdown ?? "";
      return [{ page: entry.page, title: entry.title, section: entry.section, url: withOrigin(origin, entry.href), markdown }];
    });
    return {
      status: "ok",
      data: { query, results },
      summary: results.length === 0 ? en.mcp.summary.guideNoMatches(query) : en.mcp.summary.guideMatches(results.length),
    };
  }

  const entries = index();
  const pages = flat.map(({ title, slug }) => {
    const page = slug.join("/");
    const sections = entries.filter((e) => e.page === page && e.anchor !== null).map((e) => ({ anchor: e.anchor, title: e.section }));
    return { page, title, url: withOrigin(origin, docHref(slug)), sections };
  });
  return { status: "ok", data: { pages }, summary: en.mcp.summary.guidePages(pages.length) };
}
