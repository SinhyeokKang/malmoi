import type { ComponentType } from "react";

import { CircleUser, Globe, LayoutGrid, Languages, Plus, Settings, Users } from "lucide-react";

import { canPerform, type Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 셸 사이드바의 순수 판정. **클라이언트 컴포넌트가 읽으므로 무게가 붙는 것을 여기서 막는다** —
 * `permission`·`routes`·`i18n`은 잎이고 `lucide-react`는 허용 목록에 있다 (ARCHITECTURE §6.35).
 */

export type NavProject = { slug: string; name: string; role: Role };

/**
 * pathname → 지금 보고 있는 프로젝트.
 *
 * ⚠️ **URL의 slug를 그대로 믿지 않는다.** 내 멤버십 목록 안에서 찾고, 없으면 `null`이다 — 이름·역할을
 * 지어내면 남의 프로젝트 이름이 사이드바에 뜬다. 데이터 접근은 여전히 각 페이지의
 * `requireProjectAccess`가 판정한 `projectId`로만 한다 (design §2).
 */
export function activeProject(pathname: string, memberships: readonly NavProject[]): NavProject | null {
  const [, base, slug] = pathname.split("/");
  if (base !== "projects" || slug === undefined || slug === "") return null;
  // `new`는 온보딩이 예약어로 막는 이름이라 프로젝트일 수 없다 (`lib/onboarding/slug.ts`).
  if (slug === "new") return null;
  return memberships.find((m) => m.slug === slug) ?? null;
}

export type NavSection = {
  key: "translations" | "locales" | "members" | "settings";
  label: string;
  icon: ComponentType<{ className?: string }>;
  href: (slug: string) => string;
};

/**
 * 프로젝트 컨텍스트의 항목들. **넷이다** (6b-2가 Members를, 6b-5가 Locales를 더했다).
 *
 * ⚠️ **Home·Logs는 없다** — 라우트가 6b-6·7단계다. **항목은 자기 라우트와 같은 사이클에 온다**
 * (6b-4 판정): 없는 라우트를 가리키는 항목은 404이고, 죽은 링크 검사의 접두 규칙이 그것을 못 잡는다.
 *
 * ⚠️ **노출은 편의이고 차단이 아니다.** 판정을 `canPerform`에 맡겨 권한표가 한 벌로 남는다 —
 * 여기서 역할을 다시 나열하면 표가 둘이 되고, 그중 하나가 낡는다.
 *
 * ⚠️ **Members는 `canPerform` 뒤가 아니다 — 전원에게 보인다** (design §3.9 검수 (b)). EDITOR도
 * 목록을 보고(`translation:write`로 페이지에 들어온다) **컨트롤만** 역할로 갈린다. 처음 초안의
 * "OWNER만"은 user-stories §5와 모순이었고, 감추면 EDITOR가 "누가 이 프로젝트에 있나"를 알 길이 없다.
 */
export function projectSections(role: Role): NavSection[] {
  const sections: NavSection[] = [
    { key: "translations", label: m.common.nav.translations, icon: Languages, href: (slug) => routes.translations(slug) },
    /**
     * ⚠️ **Locales도 `canPerform` 뒤가 아니다** (6b-2 관용구). 그 화면은 orphaned 로케일이 왜 그렇게
     * 됐고 어떻게 되살리는지 말하는 유일한 자리이고(ARCHITECTURE §5.5.16), 번역자가 "열이 사라졌다"의
     * 이유를 알 길이 그것뿐이다 — `project:settings` 뒤에 두면 EDITOR가 아예 못 들어온다.
     */
    { key: "locales", label: m.common.nav.locales, icon: Globe, href: (slug) => routes.locales(slug) },
    { key: "members", label: m.common.nav.members, icon: Users, href: (slug) => routes.members(slug) },
  ];
  if (canPerform(role, "project:settings")) {
    sections.push({
      key: "settings",
      label: m.common.nav.settings,
      icon: Settings,
      href: (slug) => routes.settings(slug),
    });
  }
  return sections;
}

/** 사이드바가 실제로 렌더하는 항목 — **href가 완성돼 있다.** 화면이 문자열을 조립하지 않는다. */
export type NavItem = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
};

/**
 * 사이드바의 구역. 프로젝트 구역의 라벨은 **프로젝트 이름**이라 상수가 아니다.
 */
export type NavZone = { key: "work" | "project"; label: string; items: NavItem[] };

/**
 * **축이 둘이고 구역이 그것을 드러낸다** (SAAS §7.7 — IA 확정 2026-09-09).
 *
 * ⚠️ **순서가 정보구조다** — 사용자 축이 먼저다. 프로젝트는 "내 일 안의 하나"이고, 뒤집으면
 * 프로젝트가 없는 사용자에게 빈 자리가 위에 남는다.
 *
 * ⚠️ **프로젝트 구역은 `projectSections`를 그대로 든다.** 여기서 역할을 다시 보면 권한표가 두 벌이
 * 되고 그중 하나가 낡는다 — 판정은 `canPerform` 한 곳이다.
 *
 * ⚠️ **항목에 카운트를 달지 않는다** (SAAS §7.7 결정 5). 그 숫자는 셸 레이아웃이 **매 페이지
 * 렌더에서** 세야 하는데, 번역 화면에 이미 키 수와 무관한 1.9초 고정비가 실측돼 있다.
 */
export function navZones(project: NavProject | null): NavZone[] {
  const work: NavZone = {
    key: "work",
    label: m.common.nav.yourWork,
    items: [
      { key: "projects", label: m.common.nav.allProjects, icon: LayoutGrid, href: routes.projects() },
      { key: "new-project", label: m.common.nav.newProject, icon: Plus, href: routes.newProject() },
      { key: "account", label: m.common.nav.account, icon: CircleUser, href: routes.account() },
    ],
  };
  if (project === null) return [work];

  return [
    work,
    {
      key: "project",
      label: project.name,
      items: projectSections(project.role).map((section) => ({
        key: section.key,
        label: section.label,
        icon: section.icon,
        href: section.href(project.slug),
      })),
    },
  ];
}
