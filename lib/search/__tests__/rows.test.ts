import { Box, CircleHelp, Compass, Languages, Plus } from "lucide-react";
import { describe, expect, it } from "vitest";

import { en } from "@/messages/en";
import { routes } from "@/lib/routes";
import { navWorkItems, type NavItem, type NavProject } from "@/lib/shell/nav";
import { Q_MAX_LENGTH } from "@/lib/translations/query";

import type { KeyHit } from "../key-href";
import type { SearchEntry, SearchIndex } from "../match";
import { navSearchEntries } from "../nav-index";
import { keySearchText, searchRows, searchStatuses, type SearchRow } from "../rows";

const project = (slug: string, name = `Demo ${slug}`, archived = false): NavProject => ({ slug, name, role: "OWNER", archived, image: null, defaultSurfaceSlug: "web" });
const docs: SearchEntry[] = [
  { id: "docs:", title: "Malmoi", href: "/docs", body: "Overview" },
  { id: "docs:start", title: "Start", href: "/docs/start", body: "Learn settings demo and publishing" },
  { id: "docs:start#publish", title: "Start", context: "Publish", href: "/docs/start#publish", body: "Publish translations", anchor: "publish" },
  { id: "docs:sync", title: "Sync", href: "/docs/sync", body: "Sync the repository" },
  { id: "docs:keys", title: "Keys", href: "/docs/keys", body: "Find keys" },
];
type Index = SearchIndex<NavItem["icon"]>;
const index = (memberships: readonly NavProject[] | null, extra: Partial<Index> = {}): Index =>
  ({ ...navSearchEntries(en, memberships, { activeSlug: null, userName: "Person" }), docs, ...extra });
const hit = (id: string, patch: Partial<KeyHit> = {}): KeyHit => ({ id, key: id, namespace: "_root", sourceText: "Source text", surfaceSlug: "web", slug: "demo", name: "Demo", inKey: true, localeCode: null, value: null, ...patch });
const rendered = (rows: { groups: { rows: SearchRow[] }[] }) => rows.groups.flatMap(group => group.rows.map(row => row.id));
const marks = (segments: SearchRow["title"] | undefined) => (segments ?? []).filter(s => s.match).map(s => s.text);
const text = (segments: SearchRow["title"] | undefined) => (segments ?? []).map(s => s.text).join("");

describe("searchRows — 그룹·행·ids 한 원천", () => {
  it("ids 순서 = 렌더 행 순서 (미리보기 · 질의 + Keys)", () => {
    for (const q of ["", "demo"]) {
      const result = searchRows(en, { index: index([project("demo")]), keys: [hit("demo-key")], q, activeSlug: null });
      expect(result.ids).toEqual(rendered(result));
      expect(result.ids.length).toBeGreaterThan(0);
    }
    const found = searchRows(en, { index: index([project("demo")]), keys: [hit("demo-key")], q: "demo", activeSlug: null });
    expect(found.groups.map(g => g.kind)).toEqual(["projects", "pages", "keys", "docs"]);
    expect(found.groups.map(g => g.heading)).toEqual([en.search.groups.projects, en.search.groups.pages, en.search.groups.keys, en.search.groups.docs]);
  });

  it("미리보기 — 프로젝트 3 + Go to your projects, Pages 3, Docs 3 + Go to docs", () => {
    const result = searchRows(en, { index: index(["a", "b", "c", "d"].map(slug => project(slug))), keys: [], q: "", activeSlug: "c" });
    const [projects, pages, docsGroup] = result.groups;
    expect(projects?.rows.map(r => r.id)).toEqual(["project:c", "project:a", "project:b", "go-to-projects"]);
    expect(projects?.rows.at(-1)).toMatchObject({ href: routes.projects(), tile: { kind: "glyph", icon: Box } });
    expect(text(projects?.rows.at(-1)?.title)).toBe(en.notFound.action);
    expect(pages?.rows).toHaveLength(3);
    expect(docsGroup?.rows.at(-1)).toMatchObject({ href: routes.docs(), tile: { kind: "glyph", icon: CircleHelp } });
    expect(text(docsGroup?.rows.at(-1)?.title)).toBe(en.search.goToDocs);
  });

  // 미리보기 상한의 정본은 rows.ts의 PREVIEW_LIMIT 하나다(R-B1 Y5 — match.ts의 리터럴 3이 이기던 것을 걷었다).
  it("미리보기 상한 — 그룹마다 앞 셋, 현재 프로젝트의 Pages, 문서 도입부(절 제외)", () => {
    const docsMany: SearchEntry[] = [
      { id: "docs:a#s", title: "A", href: "/docs/a#s", anchor: "s" },
      ...["d1", "d2", "d3", "d4"].map(id => ({ id: `docs:${id}`, title: id, href: `/docs/${id}`, anchor: null })),
    ];
    const memberships = [project("old", "Old", true), ...["a", "b", "c", "d"].map(slug => project(slug))];
    const result = searchRows(en, { index: index(memberships, { docs: docsMany }), keys: [], q: "", activeSlug: "c" });
    const [projects, pages, docsGroup] = result.groups;
    expect(projects?.rows.map(r => r.id)).toEqual(["project:c", "project:a", "project:b", "go-to-projects"]);
    expect(pages?.rows.map(r => r.id)).toEqual(["page:c:home", "page:c:sources", "page:c:translations"]);
    expect(docsGroup?.rows.map(r => r.id)).toEqual(["docs:d1", "docs:d2", "docs:d3", "go-to-docs"]);
    const user = searchRows(en, { index: index([]), keys: [], q: "", activeSlug: null });
    expect(user.groups[0]?.rows.map(r => r.id)).toEqual(["page:projects", "page:mcp", "page:account"]);
  });

  it.each([null, []] as const)("/docs로 가는 행은 정확히 하나 — memberships %j", (memberships) => {
    for (const q of ["", "malmoi", "docs"]) {
      const result = searchRows(en, { index: index(memberships), keys: [], q, activeSlug: null });
      expect(result.groups.flatMap(g => g.rows).filter(r => r.href === routes.docs()).length, q).toBeLessThanOrEqual(1);
    }
    expect(searchRows(en, { index: index(memberships), keys: [], q: "", activeSlug: null }).groups.flatMap(g => g.rows).filter(r => r.href === routes.docs())).toHaveLength(1);
  });

  it("행 타일 글리프는 같은 목적지의 nav 아이콘이다", () => {
    const preview = searchRows(en, { index: index([project("demo")]), keys: [], q: "", activeSlug: null });
    const byId = (rows: SearchRow[], id: string) => rows.find(r => r.id === id);
    const all = preview.groups.flatMap(g => g.rows);
    expect(byId(all, "go-to-projects")?.tile).toEqual({ kind: "glyph", icon: Box });
    expect(byId(all, "go-to-docs")?.tile).toEqual({ kind: "glyph", icon: CircleHelp });
    expect(byId(all, "project:demo")?.tile).toEqual({ kind: "project", name: "Demo demo", image: null });
    const found = searchRows(en, { index: index([project("demo")]), keys: [hit("demo-key")], q: "new project", activeSlug: null });
    expect(found.groups.flatMap(g => g.rows).find(r => r.id === "page:new-project")?.tile).toEqual({ kind: "glyph", icon: Plus });
    const keys = searchRows(en, { index: index([project("demo")]), keys: [hit("demo-key")], q: "demo", activeSlug: null });
    expect(keys.groups.find(g => g.kind === "keys")?.rows[0]?.tile).toEqual({ kind: "glyph", icon: Languages });
    for (const row of keys.groups.find(g => g.kind === "docs")?.rows ?? []) expect(row.tile).toEqual({ kind: "glyph", icon: CircleHelp });
    const projectsPage = searchRows(en, { index: index([project("demo")]), keys: [], q: "projects", activeSlug: null }).groups.find(g => g.kind === "pages")?.rows[0];
    expect(projectsPage?.tile).toEqual({ kind: "glyph", icon: navWorkItems(en)[0]?.icon });
    const changelog = searchRows(en, { index: index([project("demo")]), keys: [], q: "changelog", activeSlug: null }).groups.find(g => g.kind === "pages")?.rows[0];
    expect(changelog?.tile).toEqual({ kind: "glyph", icon: Compass });
  });

  it("매칭에 쓴 필드만 칠한다 — Projects 맥락(slug)·Keys 맥락은 칠하지 않고 Pages 맥락은 칠한다", () => {
    const projects = searchRows(en, { index: index([project("demo", "Demo")]), keys: [], q: "demo", activeSlug: null });
    const row = projects.groups.find(g => g.kind === "projects")?.rows[0];
    expect(marks(row?.title)).toEqual(["Demo"]);
    expect(text(row?.context)).toBe("demo");
    expect(marks(row?.context)).toEqual([]);
    const pages = searchRows(en, { index: index([project("demo", "Demo")]), keys: [], q: "settings demo", activeSlug: null }).groups.find(g => g.kind === "pages")?.rows[0];
    expect(marks(pages?.title)).toEqual(["Settings"]);
    expect(marks(pages?.context)).toEqual(["Demo"]);
    const keys = searchRows(en, { index: index([project("demo", "Demo")]), keys: [hit("demo.title", { sourceText: "A demo sentence" })], q: "demo", activeSlug: null }).groups.find(g => g.kind === "keys")?.rows[0];
    expect(marks(keys?.title)).toEqual(["demo"]);
    expect(text(keys?.context)).toBe("Demo · web");
    expect(marks(keys?.context)).toEqual([]);
    expect(marks(keys?.description)).toEqual(["demo"]);
  });

  it("Keys는 질의 전체 한 덩어리로 칠하고 스니펫·로케일을 싣는다", () => {
    const literal = "settings demo";
    const result = searchRows(en, { index: index([project("demo")]), keys: [hit("k", { inKey: false, localeCode: "ko", value: "prefix ".repeat(50) + literal + " end" })], q: `  ${literal} `, activeSlug: null });
    const row = result.groups.find(g => g.kind === "keys")?.rows[0];
    expect(row?.locale).toBe("ko");
    expect(marks(row?.description)).toEqual([literal]);
    expect(text(row?.description).length).toBeLessThan(200);
    const intro = searchRows(en, { index: index([project("demo")]), keys: [hit("publish", { sourceText: "Introduction" })], q: "publish", activeSlug: null }).groups.find(g => g.kind === "keys")?.rows[0];
    expect(text(intro?.description)).toBe("Introduction");
  });

  it("보관은 행의 archived이고, 질의 중 같은 점수면 보관이 뒤로 간다", () => {
    const result = searchRows(en, { index: index([project("old", "Demo old", true), project("new", "Demo new")]), keys: [], q: "demo", activeSlug: null });
    const rows = result.groups.find(g => g.kind === "projects")?.rows;
    expect(rows?.map(r => [r.id, r.archived])).toEqual([["project:new", false], ["project:old", true]]);
  });

  // UX 재감사 U1 — 보관 프로젝트에 속한 Pages 행도 Projects 행과 같은 보관 표시·정렬이다(같은 Dialog에서 한 프로젝트가 두 모양이면 안 된다).
  it("보관 프로젝트의 Pages 행이 archived이고 점수가 같으면 뒤로 간다", () => {
    const result = searchRows(en, { index: index([project("old", "Demo old", true), project("new", "Demo new")]), keys: [], q: "translations", activeSlug: null });
    const rows = result.groups.find(g => g.kind === "pages")?.rows;
    expect(rows?.map(r => [r.id, r.archived])).toEqual([["page:new:translations", false], ["page:old:translations", true]]);
    const preview = searchRows(en, { index: index([project("old", "Old", true)]), keys: [], q: "", activeSlug: null });
    expect(preview.groups.find(g => g.kind === "pages")?.rows.every(r => r.archived)).toBe(true);
  });

  it("보관 프로젝트만 있어도 미리보기에 선다", () => {
    const result = searchRows(en, { index: index([project("old", "Old", true)]), keys: [], q: "", activeSlug: null });
    expect(result.groups[0]?.rows.map(r => [r.id, r.archived])).toEqual([["project:old", true], ["go-to-projects", false]]);
  });

  it("공백만 질의 → 미리보기", () => {
    const blank = searchRows(en, { index: index([project("demo")]), keys: [hit("x")], q: "   ", activeSlug: null });
    expect(blank).toEqual(searchRows(en, { index: index([project("demo")]), keys: [], q: "", activeSlug: null }));
  });

  it.each(["__proto__", "constructor", "toString"])("질의 %s도 그룹 머리·행이 깨지지 않는다", (q) => {
    const result = searchRows(en, { index: index([project("demo")]), keys: [], q, activeSlug: null });
    expect(result.ids).toEqual(rendered(result));
    for (const group of result.groups) expect(typeof group.heading).toBe("string");
  });
});

describe("멤버십이 없으면 Docs 전용 (C1·C4·D7·D8)", () => {
  it.each([["비로그인·unauthorized·unavailable", null]] as const)("%s → 미리보기·질의 모두 그룹이 docs뿐", (_label, memberships) => {
    for (const q of ["", "demo", "changelog", "home"]) {
      const groups = searchRows(en, { index: index(memberships), keys: [hit("demo")], q, activeSlug: null }).groups.map(g => g.kind);
      expect(groups.filter(kind => kind !== "docs"), q).toEqual([]);
    }
    expect(searchRows(en, { index: index(memberships), keys: [], q: "", activeSlug: null }).groups.map(g => g.kind)).toEqual(["docs"]);
  });

  it("로그인 + 멤버십 0 → Projects 그룹 없음, Pages·Docs 있음", () => {
    const result = searchRows(en, { index: index([]), keys: [], q: "", activeSlug: null });
    expect(result.groups.map(g => g.kind)).toEqual(["pages", "docs"]);
  });

  it("색인 footer는 changelog만 — docs 항목이 없다", () => {
    const entries = navSearchEntries(en, [], { activeSlug: null, userName: "Person" });
    expect(entries.pages.filter(e => e.href === routes.docs())).toEqual([]);
    expect(entries.pages.some(e => e.href === routes.changelog())).toBe(true);
    expect(navSearchEntries(en, null, { activeSlug: null, userName: "Person" })).toEqual({ authenticated: false, projects: [], pages: [] });
  });
});

describe("keySearchText — 서버 keySearchQuery와 같은 판정", () => {
  it("비로그인이거나 trim 뒤 하한 미만이면 요청하지 않는다", () => {
    expect(keySearchText("demo", false)).toBeNull();
    for (const q of ["", "a", "  a ", "가"]) expect(keySearchText(q, true)).toBeNull();
    expect(keySearchText("  ab ", true)).toBe("ab");
  });

  // 서버는 UTF-16 길이로 잰다 — 서로게이트 쌍 1글자(길이 2)는 요청한다(지휘자 결정 B, 2026-10-03).
  it("서로게이트 쌍 1글자는 서버와 같이 요청한다", () => {
    expect(keySearchText("😀", true)).toBe("😀");
  });

  it("Q_MAX_LENGTH를 넘으면 자른다", () => {
    expect(keySearchText("x".repeat(Q_MAX_LENGTH + 1), true)).toBe("x".repeat(Q_MAX_LENGTH));
  });

  it("1글자 질의엔 Keys 그룹이 없다(결과가 와 있어도)", () => {
    expect(searchRows(en, { index: index([project("demo")]), keys: [hit("d")], q: "d", activeSlug: null }).groups.some(g => g.kind === "keys")).toBe(false);
  });
});

describe("searchStatuses", () => {
  const ready = { membership: "ready", docs: "ready", keys: "idle" } as const;

  it("모두 준비면 줄도 pending도 실패도 없다", () => {
    expect(searchStatuses(en, ready)).toEqual({ pending: false, lines: [], failed: false });
  });

  it("로딩 줄은 muted이고 pending이다", () => {
    const result = searchStatuses(en, { membership: "loading", docs: "loading", keys: "loading" });
    expect(result).toEqual({
      pending: true, failed: false,
      lines: [{ tone: "muted", text: en.projects.loading }, { tone: "muted", text: en.search.loadingKeys }, { tone: "muted", text: en.search.loadingDocs }],
    });
  });

  it("줄 순서는 그룹 순서(Projects → Pages → Keys → Docs)를 따른다 — Keys 줄이 Docs 줄보다 앞이다(#175)", () => {
    expect(searchStatuses(en, { ...ready, docs: "failed", keys: "unavailable" }).lines).toEqual([
      { tone: "danger", text: en.search.keysUnavailable }, { tone: "danger", text: en.search.docsUnavailable },
    ]);
  });

  it("멤버십 unauthorized ↔ unavailable는 다른 문장이고 실패다", () => {
    expect(searchStatuses(en, { ...ready, membership: "unauthorized" })).toEqual({ pending: false, failed: true, lines: [{ tone: "danger", text: en.search.sessionEnded }] });
    expect(searchStatuses(en, { ...ready, membership: "unavailable" })).toEqual({ pending: false, failed: true, lines: [{ tone: "danger", text: en.search.projectsUnavailable }] });
  });

  it("Keys unauthorized ↔ unavailable는 다른 문장이다 (멤버십 성공 + Keys만 unauthorized)", () => {
    expect(searchStatuses(en, { ...ready, keys: "unauthorized" }).lines).toEqual([{ tone: "danger", text: en.search.sessionEnded }]);
    expect(searchStatuses(en, { ...ready, keys: "unavailable" }).lines).toEqual([{ tone: "danger", text: en.search.keysUnavailable }]);
  });

  it("Keys·Docs 동시 실패 → danger 줄 둘, 실패라 NoMatch를 그리지 않는다", () => {
    const result = searchStatuses(en, { ...ready, docs: "failed", keys: "unavailable" });
    expect(result.lines.map(line => line.tone)).toEqual(["danger", "danger"]);
    expect(result.failed).toBe(true);
    const rows = searchRows(en, { index: index([project("demo")], { docs: [] }), keys: [], q: "demo", activeSlug: null });
    expect(rows.groups.map(g => g.kind)).toEqual(["projects", "pages"]);
  });

  // 순수 함수 계약 — 멤버십·Keys가 둘 다 세션 종료여도 문장은 한 번이다(줄 key 충돌도 막는다).
  it("세션 종료 줄은 한 번만 낸다", () => {
    expect(searchStatuses(en, { membership: "unauthorized", docs: "ready", keys: "unauthorized" }).lines).toEqual([{ tone: "danger", text: en.search.sessionEnded }]);
  });

  it("세션 종료 문장은 기존 형을 따른다", () => {
    expect(en.search.sessionEnded).toMatch(/^Your session ended\. Sign in again to /);
  });
});
