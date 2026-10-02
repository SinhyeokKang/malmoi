import { describe, expect, it } from "vitest";
import { previewGroups, scoreEntry, searchGroups, searchTokens, type SearchEntry, type SearchIndex } from "../match";
const entry = (id: string, title = "Demo", extra: Partial<SearchEntry> = {}): SearchEntry => ({ id, title, href: `/test/${id}`, ...extra });
const index = (extra: Partial<SearchIndex> = {}): SearchIndex => ({ projects: [], menus: [], docs: [], authenticated: true, ...extra });
describe("검색 판정", () => {
  it("질의를 trim·소문자·공백 분할하고 중복을 뺀다", () => {
    expect(searchTokens("  Demo  settings DEMO\n")).toEqual(["demo", "settings"]);
    expect(searchTokens(" ")).toEqual([]);
  });
  it("모든 토큰이 필드들을 가로질러 일치해야 한다", () => {
    expect(scoreEntry(entry("s", "Settings", { context: "Demo" }), ["settings", "demo"])).toEqual({ score: 4, fields: ["title", "context"] });
    expect(scoreEntry(entry("s", "Settings"), ["settings", "demo"])).toBeNull();
    expect(scoreEntry(entry("s"), [])).toBeNull();
  });
  it("제목 접두·제목 포함·맥락·본문 순위를 지킨다", () => {
    const rows = [entry("body", "Other", { body: "demo" }), entry("context", "Other", { context: "demo" }), entry("contains", "A demo"), entry("prefix", "Demo")];
    expect(rows.map(r => scoreEntry(r, ["demo"])?.score)).toEqual([1, 2, 3, 4]);
    const groups = searchGroups(index({ projects: rows }), "demo", { activeSlug: null });
    expect(groups[0]?.items.map(r => r.id)).toEqual(["prefix", "contains", "context", "body"]);
  });
  it("그룹 순서·상한·빈 그룹 제거·동점 activeSlug와 안정 정렬", () => {
    const rows = Array.from({ length: 8 }, (_, i) => entry(`${i}`, "Demo", { slug: i === 7 ? "active" : "other" }));
    const found = searchGroups(index({ projects: rows, menus: [entry("menu")], docs: [entry("doc")] }), "demo", { activeSlug: "active" });
    expect(found.map(g => g.kind)).toEqual(["projects", "menus", "docs"]);
    expect(found[0]?.items.map(r => r.id)).toEqual(["7", "0", "1", "2", "3"]);
    expect(searchGroups(index({ docs: [entry("doc")] }), "demo", { activeSlug: null }).map(g => g.kind)).toEqual(["docs"]);
    expect(searchGroups(index({ projects: rows }), " ", { activeSlug: null })).toEqual([]);
  });
  it("프로젝트가 있으면 현재·비보관 우선 3개와 출구, 프로젝트 메뉴 3개, 문서 도입부 3개", () => {
    const projects = [entry("old", "Old", { slug: "old", archived: true }), ...["a", "b", "c", "d"].map(slug => entry(slug, slug, { slug }))];
    const menus = [entry("account"), ...["a", "c"].flatMap(slug => Array.from({ length: 4 }, (_, i) => entry(`${slug}${i}`, "Home", { slug })))];
    const docs = [entry("section", "Section", { anchor: "section" }), ...["d1", "d2", "d3", "d4"].map(id => entry(id, id, { anchor: null }))];
    const found = previewGroups(index({ projects, menus, docs }), { activeSlug: "c" });
    expect(found[0]?.items.map(r => r.id)).toEqual(["c", "a", "b", "view-all-projects"]);
    expect(found[0]?.items.at(-1)).toMatchObject({ title: "View all projects", href: "/projects" });
    expect(found[1]?.items.map(r => r.id)).toEqual(["c0", "c1", "c2"]);
    expect(found[2]?.items.map(r => r.id)).toEqual(["d1", "d2", "d3", "browse-all-docs"]);
    expect(previewGroups(index({ projects, menus }), { activeSlug: null })[1]?.items.map(r => r.id)).toEqual(["a0", "a1", "a2"]);
  });
  it("프로젝트0と 비로그인 미리보기는 사용자/하단 메뉴와 Docs 출구", () => {
    const menus = ["projects", "mcp", "account", "new", "changelog", "docs"].map(id => entry(id));
    expect(previewGroups(index({ menus }), { activeSlug: null }).map(g => [g.kind, g.items.map(r => r.id)])).toEqual([["menus", ["projects", "mcp", "account"]], ["docs", ["browse-all-docs"]]]);
    expect(previewGroups(index({ authenticated: false, menus: menus.slice(-2) }), { activeSlug: null }).map(g => [g.kind, g.items.map(r => r.id)])).toEqual([["menus", ["changelog", "docs"]], ["docs", ["browse-all-docs"]]]);
  });
});
