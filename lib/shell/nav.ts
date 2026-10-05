import type { ComponentType } from "react";

import { Box, CircleHelp, CircleUser, Compass, Files, History, House, Languages, Settings, SlidersHorizontal, Users } from "lucide-react";

import { McpIcon } from "@/components/signin/brand-icons";

import { canPerform, type Role } from "@/lib/auth/permission";
import type { Messages } from "@/lib/i18n";
import { appVersion } from "@/lib/app-version";
import { routes } from "@/lib/routes";
import type { MembershipRow } from "@/lib/keys/query";

/**
 * 셸 사이드바의 순수 판정. **클라이언트 컴포넌트가 읽으므로 무게가 붙는 것을 여기서 막는다** —
 * `permission`·`routes`·`i18n`은 잎이고 `lucide-react`는 허용 목록에 있다 (ARCHITECTURE §6.35).
 *
 * ⚠️ **구조·라벨·순서는 Figma 시안(`212:944`)에서 시작했다** (8-3). 2026-09-09의 IA(PRODUCT §7.7)에서
 * 바뀐 것 넷: 사용자 축이 **둘로** 줄었고(`Projects`·`Settings` — `New project`가 빠졌다),
 * 구역 라벨이 **이름 그대로**이며(`Your work` → 사용자 이름), 프로젝트 축 순서에서 **Locales가
 * Translations보다 앞**이고, 하단에 **Help**가 붙었다.
 * ⚠️ **그 뒤 사용자 결정이 시안을 넘었다** (2026-09-27): 사용자 축은 `Projects · New project · Account` 셋이었고(2026-09-28에
 * `Account` 앞에 `MCP connector`가 들었고, 2026-09-30에 `New project`가 앱 셸 헤더로 옮겨 `Projects · MCP connector · Account`다)
 * (`navWorkItems` — 헤더 사용자 메뉴의 첫 묶음도 이 목록이다), 하단은 `Changelog · Docs`다(2026-09-28 — GitHub Releases 외부 링크였던 첫 항목이 앱 안 `/changelog`가 됐다).
 */

/**
 * ⚠️ **`archived`가 boolean이지 `Date`가 아니다** — 사이드바가 시각을 쓸 일이 없고, 셸이 넘기는
 * prop은 필요한 것만이라야 초과 프로퍼티가 안 샌다 (sec-audit 발견 23).
 */
/** `image`는 사이드바 구역 머리의 썸네일이다 (2026-09-24) — 없으면 이름 색 폴백 타일이다. */
/**
 * `defaultSurfaceSlug`는 셸이 싣는 기본 표면이고 `surfaceSlug`는 pathname에서 읽은 **보고 있는** 표면이다 — 뒤가 앞선다.
 * 둘 다 없으면 Translations가 옛 주소로 떨어진다 (audit-ux #4).
 */
/**
 * `counts`는 프로젝트 항목의 개수 배지다 (2026-09-27 사용자) — 셸이 이미 부르는 `loadMemberships`에 얹혀 온다.
 * 없으면 배지가 없다.
 */
export type NavProject = {
  slug: string; name: string; role: Role; archived: boolean; image?: string | null; surfaceSlug?: string; defaultSurfaceSlug?: string | null;
  counts?: { sources: number; members: number; keys: number };
};

/** Keep the RSC payload restricted to the seven fields shared by shell and search. */
export function toNavProjects(rows: readonly MembershipRow[]): NavProject[] {
  return rows.map(({ slug, name, role, archivedAt, image, defaultSurfaceSlug, memberCount, sourceCount, keyCount }) => ({
    slug, name, role, archived: archivedAt !== null, image, defaultSurfaceSlug,
    counts: { sources: sourceCount, members: memberCount, keys: keyCount },
  }));
}

/**
 * pathname → 지금 보고 있는 프로젝트.
 *
 * ⚠️ **URL의 slug를 그대로 믿지 않는다.** 내 멤버십 목록 안에서 찾고, 없으면 `null`이다 — 이름·역할을
 * 지어내면 남의 프로젝트 이름이 사이드바에 뜬다. 데이터 접근은 여전히 각 페이지의
 * `requireProjectAccess`가 판정한 `projectId`로만 한다 (ARCHITECTURE §6.1).
 */
export function activeProject(pathname: string, memberships: readonly NavProject[]): NavProject | null {
  const [, base, slug] = pathname.split("/");
  if (base !== "projects" || slug === undefined || slug === "") return null;
  // `new`는 온보딩이 예약어로 막는 이름이라 프로젝트일 수 없다 (`lib/onboarding/slug.ts`).
  if (slug === "new") return null;
  const member = memberships.find((m) => m.slug === slug);
  if (!member) return null;
  const parts = pathname.split("/");
  return parts[3] === "surfaces" && parts[4] && (parts[5] === "translations" || parts[5] === "locales") ? { ...member, surfaceSlug: parts[4] } : member;
}

export type NavSection = {
  key: "home" | "sources" | "translations" | "members" | "logs" | "settings";
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
 * ⚠️ **순서** — Home · Sources · Translations · Logs · Members · Project settings (2026-09-30 사용자 — 시안의 Members · Logs를 맞바꿨다).
 * 소스가 번역보다 앞인 것은 "어떤 파일·언어가 있나"가 "그 언어를 채운다"보다 앞선 질문이어서다.
 *
 * ⚠️ **항목은 자기 라우트와 같은 사이클에 온다** (6b-4 판정) — 없는 라우트를 가리키는 항목은 404이고,
 * 죽은 링크 검사의 접두 규칙(`/projects/*`)이 그것을 못 잡는다.
 *
 * ⚠️ **노출은 편의이고 차단이 아니다.** 판정을 `canPerform`에 맡겨 권한표가 한 벌로 남는다 —
 * 여기서 역할을 다시 나열하면 표가 둘이 되고, 그중 하나가 낡는다.
 *
 * ⚠️ **Members·Locales·Logs는 `canPerform` 뒤가 아니다 — 전원에게 보인다.** EDITOR도 그 화면들에
 * `translation:write`로 들어오고 **컨트롤만** 역할로 갈린다 (ARCHITECTURE §6.1 · 6b-2 · 6b-5).
 */
export function projectSections(m: Messages, role: Role): NavSection[] {
  const sections: NavSection[] = [
    // 착지점이라 맨 앞이다 (PRODUCT §7.7 결정 1).
    { key: "home", label: m.common.nav.home, icon: House, href: (slug) => routes.project(slug), exact: true },
    { key: "sources", label: m.common.nav.sources, icon: Files, href: (slug) => routes.sources(slug), exact: false },
    {
      key: "translations",
      label: m.common.nav.translations,
      icon: Languages,
      href: (slug) => routes.translations(slug),
      exact: false,
    },
    /** `exact: true`인 것은 하위 라우트가 없어서다 — `?cursor=`는 쿼리라 경로가 아니다. */
    { key: "logs", label: m.common.nav.logs, icon: History, href: (slug) => routes.logs(slug), exact: true },
    { key: "members", label: m.common.nav.members, icon: Users, href: (slug) => routes.members(slug), exact: false },
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
   * `Projects`는 멤버십 배열의 길이, 프로젝트 축의 셋(Sources·Translations·Members)은 같은 멤버십 조회의
   * 관계 `_count`다 — **둘 다 왕복이 0이다.** ⚠️ 셋은 2026-09-27에 열렸다(사용자 — PRODUCT §7.7 결정 5를 뒤집었다).
   * 거절 근거가 "매 페이지 왕복"이었고, 셸이 이미 부르는 조회에 얹으면 그 근거가 서지 않는다.
   */
  badge?: number | string;
};

/**
 * 사이드바의 구역. **라벨이 이름 그대로다** — 사용자 축은 사용자 이름, 프로젝트 축은 프로젝트 이름.
 */
export type NavZone = { key: "work" | "project"; label: string; items: NavItem[] };

/**
 * 사용자 축 항목 — **사이드바 사용자 구역과 헤더 사용자 메뉴의 첫 묶음이 이 목록 하나를 읽는다** (2026-09-27 사용자). 두 벌이면
 * 한쪽에만 항목이 늘어 순서가 갈린다. `projectCount`를 주면 `Projects`가 개수 배지를 든다(사이드바만 준다 — 메뉴엔 배지가 없다).
 */
export function navWorkItems(m: Messages, projectCount?: number): NavItem[] {
  return [
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
    ...(projectCount === undefined ? {} : { badge: projectCount }),
  },
  /**
   * ⚠️ **아이콘이 `CircleUser`다** (2026-09-11 사용자) — 헤더 우상단 서랍 **안**의 같은 항목과
   * 같은 글리프라야 "내 계정"이 한 어휘로 읽힌다. `Settings`(톱니)는 프로젝트 설정이 쓰므로,
   * 여기에 같이 쓰면 사용자 축과 프로젝트 축이 같은 모양으로 섞인다.
   */
  /**
   * `MCP connector` (mcp-connector 핸드오프 §4) — **`Account` 바로 앞**이다. 토큰은 프로젝트가 아니라 사람에게 붙어 `Account`와 같은
   * 축이다. 이 목록을 헤더 사용자 메뉴의 첫 묶음도 읽으므로 거기에도 함께 선다(의도).
   */
  // 글리프는 공식 MCP 로고다(2026-09-29 사용자 — 옛 lucide `Plug`). lucide에 브랜드가 없어 `brand-icons.tsx`의 인라인 SVG다.
  { key: "mcp", label: m.common.nav.mcp, icon: McpIcon, href: routes.mcp(), exact: true },
  /**
   * `Preferences` (ui-locales design §5.2) — **`MCP connector`와 `Account` 사이**다(2026-10-04 사용자 — `Account`가 목록 끝에 남는다).
   * 글리프는 `SlidersHorizontal` — `Settings`(톱니)는 Project settings, `CircleUser`는 Account라 셋이 갈려야 한다.
   */
  { key: "preferences", label: m.common.nav.preferences, icon: SlidersHorizontal, href: routes.preferences(), exact: true },
  { key: "account", label: m.common.nav.account, icon: CircleUser, href: routes.account(), exact: true },
  ];
}

/**
 * **축이 둘이고 구역이 그것을 드러낸다** (PRODUCT §7.7 — IA 확정 2026-09-09, 8-3이 시안에 맞춰 조정).
 *
 * ⚠️ **순서가 정보구조다** — 사용자 축이 먼저다. 프로젝트는 "내 일 안의 하나"이고, 뒤집으면
 * 프로젝트가 없는 사용자에게 빈 자리가 위에 남는다.
 *
 * ⚠️ **`New project`가 사용자 축에 없다** (2026-09-30 사용자 — 2026-09-27의 "Projects 바로 아래"를 되돌렸다). 자리는
 * 앱 셸 헤더의 아바타 왼쪽 버튼이다(`components/shell/header.tsx`) — 사이드바와 헤더 메뉴가 이 목록을 함께 읽으므로 둘에서 같이 빠진다.
 *
 * ⚠️ **프로젝트 구역은 `projectSections`를 그대로 든다.** 여기서 역할을 다시 보면 권한표가 두 벌이
 * 되고 그중 하나가 낡는다 — 판정은 `canPerform` 한 곳이다.
 */
export function navZones(
  m: Messages,
  project: NavProject | null,
  context: { userName: string; projectCount: number },
): NavZone[] {
  const work: NavZone = {
    key: "work",
    label: context.userName,
    items: navWorkItems(m, context.projectCount),
  };
  if (project === null) return [work];

  return [
    work,
    {
      key: "project",
      label: project.name,
      items: projectSections(m, project.role).map((section) => ({
        key: section.key,
        label: section.label,
        icon: section.icon,
        href: section.key === "translations" ? translationsHref(project) : section.href(project.slug),
        exact: section.exact,
        badge: sectionBadge(section.key, project.counts),
      })),
    },
  ];
}

/**
 * ⚠️ **Translations는 프로젝트 전체 키 수다** (2026-09-27 사용자) — 보고 있는 표면을 따라 바뀌지 않는다.
 */
function sectionBadge(key: NavSection["key"], counts: NavProject["counts"]): number | undefined {
  if (counts === undefined) return undefined;
  if (key === "sources") return counts.sources;
  if (key === "translations") return counts.keys;
  if (key === "members") return counts.members;
  return undefined;
}

/**
 * **Translations는 표면 주소를 직접 가리킨다** (audit-ux #4). 옛 `/translations`는 누를 때마다 서버 redirect 한 번
 * (인증 → 접근 → `defaultSurface` 조회 → redirect)을 더 거치고, 두 세그먼트 모두 경계가 없어 prefetch도 무의미했다.
 * ⚠️ **옛 라우트는 지우지 않는다** — 외부 링크 호환이고, 기본 표면을 모를 때 판정을 맡는 자리다.
 */
function translationsHref(project: NavProject): string {
  const surface = project.surfaceSlug ?? project.defaultSurfaceSlug;
  return surface ? routes.surfaceTranslations(project.slug, surface) : routes.translations(project.slug);
}

/**
 * 사이드바 하단의 전역 항목. **프로젝트·사용자 축이 아니라 공개 셸 페이지들이라 구역 밖이다.**
 *
 * ⚠️ **Changelog → Docs 둘이다** (2026-09-27 사용자 — Changelog는 2026-09-28에 GitHub Releases 외부 링크에서 `/changelog`로). Sign out은 여기서 빠져 사용자 메뉴에만 있다.
 * ⚠️ **아이콘이 사용자 메뉴의 같은 항목과 같다**(`Compass` · `CircleHelp`) — 같은 곳을 두 글리프로 가리키지 않는다.
 * ⚠️ **Docs가 `/docs`(개요)를 가리킨다** (8-3 사용자 결정). 셸은 역할을 읽지 않는다 — 개발자·편집자 갈래는 개요가 준다.
 */
export function navFooterItems(m: Messages): NavItem[] {
  // `exact`는 효과가 없다 — 사이드바는 앱 셸(`app/(edit)/layout.tsx`)에만 서고 `/docs/*`·`/changelog`는 공개 셸이라 둘이 한 화면에 안 선다.
  return [
    // 오른쪽 배지는 현재 앱 버전 `x.y.z`다 (2026-09-28 사용자 — 개수 배지와 같은 자리·모양). 비면 싣지 않는다.
    { key: "changelog", label: m.changelog.title, icon: Compass, href: routes.changelog(), exact: true, ...(appVersion() === "" ? {} : { badge: appVersion() }) },
    { key: "docs", label: m.publicDocs.docs.title, icon: CircleHelp, href: routes.docs(), exact: true },
  ];
}
