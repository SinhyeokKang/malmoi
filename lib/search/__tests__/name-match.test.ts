import { describe, expect, it } from "vitest";

import { searchProjects } from "@/lib/projects/list";
import { switcherProjects } from "@/lib/shell/switcher";

import { KEY_QUERY_MIN, matchesAllTokens, SEARCH_GROUP_LIMIT, searchGroups, searchTokens, type SearchIndex } from "../match";

/**
 * **프로젝트 이름 대조는 세 화면이 한 규칙이다** (search-ux-unify D1·C6) — 검색 Projects · `/projects` · LNB 스위처.
 * 같은 입력 표를 셋에 함께 돌려, 한쪽만 바뀌면 같은 질의에 화면마다 다른 답을 하는 회귀를 잡는다.
 */
const names = ["Web App", "app-web", "Mobile App", "İabc", "İİ"];
const rows = names.map((name, i) => ({ slug: `p${i}`, name, archived: i === 2 }));
const index: SearchIndex = {
  projects: rows.map(row => ({ id: row.slug, title: row.name, href: `/projects/${row.slug}`, slug: row.slug, archived: row.archived })),
  pages: [], docs: [], authenticated: true,
};
const sorted = (slugs: string[]) => [...slugs].sort();
const viaSearch = (q: string) => sorted(searchGroups(index, q, { activeSlug: null }).flatMap(g => g.items.map(item => item.id)));
const viaProjects = (q: string) => sorted(searchProjects(rows, q).map(row => row.slug));
const viaSwitcher = (q: string) => sorted(switcherProjects(rows, q).map(row => row.slug));

describe("프로젝트 이름 대조 — 토큰 AND 한 규칙", () => {
  it.each([
    ["app web", ["p0", "p1"]],
    ["  WEB ", ["p0", "p1"]],
    ["mobile app", ["p2"]],
    ["web mobile", []],
    ["a", ["p0", "p1", "p2", "p3"]],
    ["i", ["p2", "p3", "p4"]],
  ])("%j → 세 화면이 같은 행 집합", (q, expected) => {
    expect(rows.length).toBeLessThanOrEqual(SEARCH_GROUP_LIMIT);
    expect(viaProjects(q)).toEqual(expected);
    expect(viaSwitcher(q)).toEqual(expected);
    expect(viaSearch(q)).toEqual(expected);
  });

  it.each(["", "   "])("빈 질의 %j — 목록 둘은 전부, 검색은 질의 결과가 아니라 미리보기로 간다", (q) => {
    expect(viaProjects(q)).toEqual(sorted(rows.map(row => row.slug)));
    expect(viaSwitcher(q)).toEqual(sorted(rows.map(row => row.slug)));
    expect(searchGroups(index, q, { activeSlug: null })).toEqual([]);
  });

  it("matchesAllTokens는 소문자 원문에서 모든 토큰을 찾는다 — 토큰이 없으면 참", () => {
    expect(matchesAllTokens("Web App", searchTokens("app web"))).toBe(true);
    expect(matchesAllTokens("Web App", searchTokens("app mobile"))).toBe(false);
    expect(matchesAllTokens("İabc", searchTokens("A"))).toBe(true);
    expect(matchesAllTokens("anything", [])).toBe(true);
  });

  it("공유 상수 — 키 검색 하한과 그룹 상한", () => {
    expect(KEY_QUERY_MIN).toBe(2);
    expect(SEARCH_GROUP_LIMIT).toBe(5);
  });
});
