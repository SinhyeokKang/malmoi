import { Plus } from "lucide-react";
import { describe, expect, it } from "vitest";
import { navFooterItems, navWorkItems, navZones, type NavProject } from "@/lib/shell/nav";
import { routes } from "@/lib/routes";
import { navSearchEntries } from "../nav-index";
const project = (slug: string, role: NavProject["role"] = "OWNER", archived = false): NavProject => ({ slug, name: `Demo ${slug}`, role, archived, image: null, defaultSurfaceSlug: "main" });
const options = { activeSlug: "editor", userName: "Person" };
describe("내비 검색 색인", () => {
  it("null(비로그인·멤버십 실패)은 빈 Projects·Pages, 빈 배열은 사용자 Pages+New project+Changelog — /docs 항목은 없다", () => {
    expect(navSearchEntries(null, options)).toEqual({ authenticated: false, projects: [], pages: [] });
    const found = navSearchEntries([], options);
    expect(found.authenticated).toBe(true);
    expect(found.pages.map(e => e.href)).toEqual([...navWorkItems().map(i => i.href), routes.newProject(), routes.changelog()]);
    expect(found.pages.map(e => e.icon)).toEqual([...navWorkItems().map(i => i.icon), Plus, navFooterItems().find(i => i.key === "changelog")?.icon]);
  });
  it("모든 역할과 보관 프로젝트가 기존 navZones의 권한·표면 주소·라벨을 그대로 쓴다", () => {
    const projects = [project("owner"), project("editor", "EDITOR"), project("archived", "OWNER", true)];
    const result = navSearchEntries(projects, options);
    expect(result.projects.map(e => e.slug)).toEqual(projects.map(p => p.slug));
    expect(result.projects.at(-1)).toMatchObject({ archived: true, href: routes.project("archived") });
    for (const p of projects) {
      const expected = navZones(p, { userName: options.userName, projectCount: projects.length }).find(z => z.key === "project")?.items;
      expect(expected).toBeDefined();
      expect(result.pages.filter(e => e.slug === p.slug).map(e => ({ title: e.title, href: e.href, icon: e.icon }))).toEqual(expected?.map(i => ({ title: i.label, href: i.href, icon: i.icon })));
    }
    expect(result.pages.filter(e => e.href.endsWith("/settings")).map(e => e.slug)).toEqual(["owner", "archived"]);
    expect(result.pages.find(e => e.slug === "editor")).toMatchObject({ context: "Demo editor" });
    // 보관 프로젝트의 Pages 항목도 보관을 싣는다(UX 재감사 U1) — 사용자 Pages(프로젝트 밖)는 싣지 않는다.
    expect(result.pages.filter(e => e.slug !== undefined).map(e => [e.slug, e.archived])).toEqual(result.pages.filter(e => e.slug !== undefined).map(e => [e.slug, e.slug === "archived"]));
    expect(result.pages.filter(e => e.slug === undefined).every(e => e.archived === undefined)).toBe(true);
    expect(new Set([...result.projects, ...result.pages].map(e => e.id)).size).toBe(result.projects.length + result.pages.length);
  });
});
