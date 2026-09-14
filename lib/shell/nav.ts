import type { ComponentType } from "react";

import { Box, CircleHelp, CircleUser, Globe, History, House, Languages, Settings, Users } from "lucide-react";

import { canPerform, type Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 셸 사이드바의 순수 판정. **클라이언트 컴포넌트가 읽으므로 무게가 붙는 것을 여기서 막는다** —
 * `permission`·`routes`·`i18n`은 잎이고 `lucide-react`는 허용 목록에 있다 (ARCHITECTURE §6.35).
 *
 * ⚠️ **구조·라벨·순서는 Figma 시안(`212:944`)이 정본이다** (8-3). 2026-09-09의 IA(PRODUCT §7.7)에서
 * 바뀐 것 넷: 사용자 축이 **둘로** 줄었고(`Projects`·`Settings` — `New project`가 빠졌다),
 * 구역 라벨이 **이름 그대로**이며(`Your work` → 사용자 이름), 프로젝트 축 순서에서 **Locales가
 * Translations보다 앞**이고, 하단에 **Help**가 붙었다.
 */

/**
 * ⚠️ **`archived`가 boolean이지 `Date`가 아니다** — 사이드바가 시각을 쓸 일이 없고, 셸이 넘기는
 * prop은 필요한 것만이라야 초과 프로퍼티가 안 샌다 (sec-audit 발견 23).
 */
export type NavProject = { slug: string; name: string; role: Role; archived: boolean; surfaceSlug?: string };

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
  const member = memberships.find((m) => m.slug === slug);
  if (!member) return null;
  const parts = pathname.split("/");
  return parts[3] === "surfaces" && parts[4] ? { ...member, surfaceSlug: parts[4] } : member;
}

export type NavSection = {
  key: "home" | "locales" | "translations" | "members" | "logs" | "settings";
  label: string;
  icon: ComponentType<{ className?: string }>;
  href: (slug: string) => string;
  /**
   * 활성 판정이 **정확히 일치**인가. ⚠️ **규칙은 축이 아니라 라우트 모양에 붙는다** (6b-6).
   * `/projects/<slug>`(Home)는 그 프로젝트의 **모든** 하위 라우트의 접두라, 접두로 재면 번역 화면에
   * 있어도 Home이 선택돼 보인다 — 사이드바가 어디에 있는지를 거짓으로 말한다. 하위 경로가 있는
   * 항목(`?ns=`·`/settings`)만 접두다.
   */
  exact: boolean;
};

/**
 * 프로젝트 컨텍스트의 항목들. **여섯이다.**
 *
 * ⚠️ **순서가 시안이다** — Home · Locales · Translations · Members · Logs · Project settings.
 * 로케일이 번역보다 앞인 것은 "어떤 언어가 있나"가 "그 언어를 채운다"보다 앞선 질문이어서다.
 *
 * ⚠️ **항목은 자기 라우트와 같은 사이클에 온다** (6b-4 판정) — 없는 라우트를 가리키는 항목은 404이고,
 * 죽은 링크 검사의 접두 규칙(`/projects/*`)이 그것을 못 잡는다.
 *
 * ⚠️ **노출은 편의이고 차단이 아니다.** 판정을 `canPerform`에 맡겨 권한표가 한 벌로 남는다 —
 * 여기서 역할을 다시 나열하면 표가 둘이 되고, 그중 하나가 낡는다.
 *
 * ⚠️ **Members·Locales·Logs는 `canPerform` 뒤가 아니다 — 전원에게 보인다.** EDITOR도 그 화면들에
 * `translation:write`로 들어오고 **컨트롤만** 역할로 갈린다 (design §3.9 · 6b-2 · 6b-5).
 */
export function projectSections(role: Role): NavSection[] {
  const sections: NavSection[] = [
    // 착지점이라 맨 앞이다 (PRODUCT §7.7 결정 1).
    { key: "home", label: m.common.nav.home, icon: House, href: (slug) => routes.project(slug), exact: true },
    { key: "locales", label: m.common.nav.locales, icon: Globe, href: (slug) => routes.locales(slug), exact: false },
    {
      key: "translations",
      label: m.common.nav.translations,
      icon: Languages,
      href: (slug) => routes.translations(slug),
      exact: false,
    },
    { key: "members", label: m.common.nav.members, icon: Users, href: (slug) => routes.members(slug), exact: false },
    /** `exact: true`인 것은 하위 라우트가 없어서다 — `?cursor=`는 쿼리라 경로가 아니다. */
    { key: "logs", label: m.common.nav.logs, icon: History, href: (slug) => routes.logs(slug), exact: true },
  ];
  if (canPerform(role, "project:settings")) {
    sections.push({
      key: "settings",
      label: m.common.nav.projectSettings,
      icon: Settings,
      href: (slug) => routes.settings(slug),
      exact: false,
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
  /** `NavSection.exact`와 같은 뜻 — 활성 판정이 정확히 일치인가. */
  exact: boolean;
  /**
   * 우측 개수 배지 (8-3, 시안).
   *
   * ⚠️ **여기 있는 것은 `Projects` 하나다.** 그 값은 셸이 **이미 조회한** 멤버십 배열의 길이라
   * 왕복이 0이다. 시안의 나머지 셋(Locales·Translations·Members)은 프로젝트별 집계라 **모든
   * 페이지에 왕복을 더한다** — PRODUCT §7.7 결정 5가 거절했고 §8이 🔒로 다시 열어 둔 항목이다.
   */
  badge?: number;
};

/**
 * 사이드바의 구역. **라벨이 이름 그대로다** — 사용자 축은 사용자 이름, 프로젝트 축은 프로젝트 이름.
 */
export type NavZone = { key: "work" | "project"; label: string; items: NavItem[] };

/**
 * **축이 둘이고 구역이 그것을 드러낸다** (PRODUCT §7.7 — IA 확정 2026-09-09, 8-3이 시안에 맞춰 조정).
 *
 * ⚠️ **순서가 정보구조다** — 사용자 축이 먼저다. 프로젝트는 "내 일 안의 하나"이고, 뒤집으면
 * 프로젝트가 없는 사용자에게 빈 자리가 위에 남는다.
 *
 * ⚠️ **`New project`가 사이드바에 없다** (8-3 사용자 결정 — 시안). 새 프로젝트로 가는 길은
 * `Projects` 목록의 버튼 하나이고, 그래야 "만들기"가 목록의 맥락 안에서 일어난다. `/projects/new`
 * 라우트는 그대로 있고 **직접 URL로도 열린다** — 없앤 것은 링크이지 라우트가 아니다.
 *
 * ⚠️ **프로젝트 구역은 `projectSections`를 그대로 든다.** 여기서 역할을 다시 보면 권한표가 두 벌이
 * 되고 그중 하나가 낡는다 — 판정은 `canPerform` 한 곳이다.
 */
export function navZones(
  project: NavProject | null,
  context: { userName: string; projectCount: number },
): NavZone[] {
  const work: NavZone = {
    key: "work",
    label: context.userName,
    items: [
      /**
       * ⚠️ **사용자 축은 전부 정확히 일치다.** `/projects`가 `/projects/new`의 접두라, 접두로 재면
       * 새 프로젝트 화면에서 `Projects`도 함께 선택돼 보인다.
       */
      {
        key: "projects",
        label: m.common.nav.projects,
        /**
         * ⚠️ **목록 행의 글리프와 같다** (2026-09-11 사용자) — 사이드바 항목과 그 항목이 데려가는
         * 화면의 행이 다른 글리프를 쓰면 "프로젝트"의 시각 어휘가 둘이 된다.
         */
        icon: Box,
        href: routes.projects(),
        exact: true,
        badge: context.projectCount,
      },
      /**
       * ⚠️ **아이콘이 `CircleUser`다** (2026-09-11 사용자) — 헤더 우상단 서랍 **안**의 같은 항목과
       * 같은 글리프라야 "내 계정"이 한 어휘로 읽힌다. `Settings`(톱니)는 프로젝트 설정이 쓰므로,
       * 여기에 같이 쓰면 사용자 축과 프로젝트 축이 같은 모양으로 섞인다.
       */
      { key: "account", label: m.common.nav.settings, icon: CircleUser, href: routes.account(), exact: true },
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
        href: project.surfaceSlug && section.key === "translations" ? routes.surfaceTranslations(project.slug, project.surfaceSlug)
          : project.surfaceSlug && section.key === "locales" ? routes.surfaceLocales(project.slug, project.surfaceSlug)
          : section.href(project.slug),
        exact: section.exact,
      })),
    },
  ];
}

/**
 * 사이드바 하단의 전역 항목. **라우트가 아니라 "앱을 벗어나는 것"들이라 구역 밖이다.**
 *
 * ⚠️ **Help가 `/docs`를 가리킨다** (8-3 사용자 결정). 그 화면은 아직 placeholder이지만 **라우트는
 * 실재한다**(8-1a가 땄다) — 없는 곳을 가리키는 항목이 아니다. 내용은 출시 전에 채운다.
 */
export function navFooterItems(): NavItem[] {
  return [{ key: "docs", label: m.publicDocs.docs.title, icon: CircleHelp, href: routes.docs(), exact: true }];
}
