import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { navFooterItems, navWorkItems, navZones, type NavProject } from "@/lib/shell/nav";
import type { SearchEntry, SearchIndex } from "./match";

export function navSearchEntries(memberships: readonly NavProject[] | null, { userName }: { activeSlug: string | null; userName: string }): Omit<SearchIndex, "docs"> {
  const projects: SearchEntry[] = (memberships ?? []).map(project => ({
    id: `project:${project.slug}`, title: project.name, context: project.slug, href: routes.project(project.slug),
    slug: project.slug, archived: project.archived, image: project.image,
  }));
  const menus: SearchEntry[] = memberships === null ? [] : [
    ...navWorkItems().map(item => ({ id: `menu:${item.key}`, title: item.label, href: item.href })),
    { id: "menu:new-project", title: m.common.nav.newProject, href: routes.newProject() },
    ...memberships.flatMap(project => navZones(project, { userName, projectCount: memberships.length })
      .filter(zone => zone.key === "project").flatMap(zone => zone.items.map(item => ({
        id: `menu:${project.slug}:${item.key}`, title: item.label, context: project.name, href: item.href, slug: project.slug,
      })))),
  ];
  menus.push(...navFooterItems().map(item => ({ id: `menu:${item.key}`, title: item.label, href: item.href })));
  return { authenticated: memberships !== null, projects, menus };
}
