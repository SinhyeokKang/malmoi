"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { routes } from "@/lib/routes";

type MenuProject = { slug: string; name: string; archived: boolean; image?: string | null };

/**
 * 메뉴 안의 프로젝트 행 — LNB 스위처와 헤더 사용자 메뉴가 같은 행을 쓴다(user-menu-projects D3). 누르면 그 프로젝트 **Home**이다.
 *
 * ⚠️ **`selected`를 그대로 넘긴다** — `false`도 `menuitemradio aria-checked=false`가 된다(`DropdownMenuItem`). 지금 프로젝트가
 * 없는 자리(공개 셸 · `/projects`)는 아예 안 넘겨야 일반 `menuitem`이다.
 * ⚠️ **`asChild` + `selected`는 POSTMORTEM 2026-09-09의 조합이다** — 체크는 프리미티브의 `Slottable` 덕에 `<Link>` 안으로 들어간다.
 * 나머지 props는 항목으로 흘린다 — 스위처는 검색 입력의 IME를 지키는 포인터 핸들러를 여기로 준다.
 */
export function ProjectMenuItem({
  project,
  selected,
  ...itemProps
}: { project: MenuProject; selected?: boolean } & Omit<ComponentProps<typeof DropdownMenuItem>, "asChild" | "children" | "selected">) {
  return (
    <DropdownMenuItem asChild selected={selected} {...itemProps}>
      <Link href={routes.project(project.slug)}>
        <ProjectThumbnail name={project.name} src={project.image} size="xs" />
        {/* ⚠️ 이름이 남는 폭을 먹는다(`flex-1`) — 그래야 배지 뒤의 `Check`(`ml-auto`)가 배지에 붙는다. 둘 다 `ml-auto`면 빈 폭을 나눠 갖는다. */}
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        {project.archived && (
          // ⚠️ `/projects` 행 칩과 같은 형·같은 키다(`project-list.tsx`의 `archived` 칩) — 두 벌이면 하나가 낡는다.
          <StatusBadge state="archived" className="shrink-0" />
        )}
      </Link>
    </DropdownMenuItem>
  );
}

/**
 * `ProjectMenuItem` 한 줄의 골격. ⚠️ **행과 같은 파일에 둔다** — `DropdownMenuItem`의 패딩·gap(`mx-1 px-2 py-1.5 gap-2`)과
 * 썸네일 16·`text-sm` 줄이 따로 떠내려가면 골격과 실물이 다른 높이로 선다(POSTMORTEM 2026-09-16 · 2026-10-08). 한 줄이다 — 골격이
 * 실물보다 길면 안 된다. 메뉴 항목이 아니라 포커스를 받지 않고 `aria-hidden`이다(상태 문장은 호출부의 live region이 든다).
 */
export function ProjectMenuItemSkeleton() {
  return (
    <div data-project-menu-item-skeleton aria-hidden aria-busy="true" className="mx-1 flex items-center gap-2 px-2 py-1.5 text-sm">
      <Skeleton className="size-4 shrink-0" />
      <Skeleton size="sm" className="w-28" />
    </div>
  );
}
