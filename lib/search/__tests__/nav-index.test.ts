import { describe, expect, it } from "vitest";
import { navFooterItems, navWorkItems, navZones, type NavProject } from "@/lib/shell/nav";
import { routes } from "@/lib/routes";
import { navSearchEntries } from "../nav-index";
const project = (slug: string, role: NavProject["role"] = "OWNER", archived = false): NavProject => ({ slug, name: `Demo ${slug}`, role, archived, image: null, defaultSurfaceSlug: "main" });
const options = { activeSlug: "editor", userName: "Person" };
describe("내비 검색 색인", () => {
  it("null은 하단만, 빈 배열은 사용자 메뉴+New project+하단", () => {
    expect(navSearchEntries(null, options)).toMatchObject({ authenticated: false, projects: [], menus: navFooterItems().map(i => ({ title: i.label, href: i.href })) });
    const found = navSearchEntries([], options);
    expect(found.authenticated).toBe(true);
    expect(found.menus.map(e => e.href)).toEqual([...navWorkItems().map(i => i.href), routes.newProject(), ...navFooterItems().map(i => i.href)]);
  });
  it("모든 역할과 보관 프로젝트가 기존 navZones의 권한·표면 주소·라벨을 그대로 쓴다", () => {
    const projects = [project("owner"), project("editor", "EDITOR"), project("archived", "OWNER", true)];
    const result = navSearchEntries(projects, options);
    expect(result.projects.map(e => e.slug)).toEqual(projects.map(p => p.slug));
    expect(result.projects.at(-1)).toMatchObject({ archived: true, href: routes.project("archived") });
    for (const p of projects) {
      const expected = navZones(p, { userName: options.userName, projectCount: projects.length }).find(z => z.key === "project")?.items;
      expect(expected).toBeDefined();
      expect(result.menus.filter(e => e.slug === p.slug).map(e => ({ title: e.title, href: e.href }))).toEqual(expected?.map(i => ({ title: i.label, href: i.href })));
    }
    expect(result.menus.filter(e => e.href.endsWith("/settings")).map(e => e.slug)).toEqual(["owner", "archived"]);
    expect(result.menus.find(e => e.slug === "editor")).toMatchObject({ context: "Demo editor" });
    expect(new Set([...result.projects, ...result.menus].map(e => e.id)).size).toBe(result.projects.length + result.menus.length);
  });
});
