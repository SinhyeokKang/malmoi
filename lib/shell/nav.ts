import type { ComponentType } from "react";

import { Languages, Settings } from "lucide-react";

import { canPerform, type Role } from "@/lib/auth/permission";
import { routes } from "@/lib/routes";

/**
 * 셸 사이드바의 순수 판정. **클라이언트 컴포넌트가 읽으므로 무게가 붙는 것을 여기서 막는다** —
 * `permission`·`routes`는 잎이고 `lucide-react`는 허용 목록에 있다 (ARCHITECTURE §6.35).
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
  key: "translations" | "settings";
  label: string;
  icon: ComponentType<{ className?: string }>;
  href: (slug: string) => string;
};

/**
 * 프로젝트 컨텍스트의 항목들. **6a는 둘이다** — Members는 6b가 더한다.
 *
 * ⚠️ **노출은 편의이고 차단이 아니다.** 판정을 `canPerform`에 맡겨 권한표가 한 벌로 남는다 —
 * 여기서 역할을 다시 나열하면 표가 둘이 되고, 그중 하나가 낡는다.
 */
export function projectSections(role: Role): NavSection[] {
  const sections: NavSection[] = [
    { key: "translations", label: "Translations", icon: Languages, href: (slug) => routes.translations(slug) },
  ];
  if (canPerform(role, "project:settings")) {
    sections.push({ key: "settings", label: "Settings", icon: Settings, href: (slug) => routes.settings(slug) });
  }
  return sections;
}
