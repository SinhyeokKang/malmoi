import { Plus } from "lucide-react";
import type { Messages } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { navFooterItems, navWorkItems, navZones, type NavItem, type NavProject } from "@/lib/shell/nav";
import type { SearchEntry, SearchIndex } from "./match";

type NavIcon = NavItem["icon"];

/**
 * 셸 내비에서 검색 색인을 만든다. 멤버십이 없으면(비로그인·`unauthorized`·`unavailable`) Projects·Pages가 비어 Docs만 찾는다
 * (search-ux-unify C1·C4·D7). 하단 항목은 `changelog`만 싣는다 — `/docs` 행은 Docs 그룹의 `Go to docs` 하나다(D8).
 * 각 Pages 항목은 같은 nav 항목의 아이콘을, 프로젝트 구역 항목은 그 프로젝트의 보관 여부를 싣는다. `New project`는 nav 항목이 없어 헤더 버튼과 같은 `Plus`다.
 */
export function navSearchEntries(m: Messages, memberships: readonly NavProject[] | null, { userName }: { activeSlug: string | null; userName: string }): Omit<SearchIndex<NavIcon>, "docs"> {
  if (memberships === null) return { authenticated: false, projects: [], pages: [] };
  const projects: SearchEntry<NavIcon>[] = memberships.map(project => ({
    id: `project:${project.slug}`, title: project.name, context: project.slug, href: routes.project(project.slug),
    slug: project.slug, archived: project.archived, image: project.image,
  }));
  const pages: SearchEntry<NavIcon>[] = [
    ...navWorkItems(m).map(item => ({ id: `page:${item.key}`, title: item.label, href: item.href, icon: item.icon })),
    { id: "page:new-project", title: m.common.nav.newProject, href: routes.newProject(), icon: Plus },
    ...memberships.flatMap(project => navZones(m, project, { userName, projectCount: memberships.length })
      .filter(zone => zone.key === "project").flatMap(zone => zone.items.map(item => ({
        // 보관 프로젝트의 Pages도 보관을 싣는다 — Projects 행과 같은 배지·정렬 tie-break(UX 재감사 U1). 색인에서 빼면 복구 경로(Logs·Settings)가 사라진다.
        id: `page:${project.slug}:${item.key}`, title: item.label, context: project.name, href: item.href, slug: project.slug, archived: project.archived, icon: item.icon,
      })))),
    ...navFooterItems(m).filter(item => item.key === "changelog").map(item => ({ id: `page:${item.key}`, title: item.label, href: item.href, icon: item.icon })),
  ];
  return { authenticated: true, projects, pages };
}
