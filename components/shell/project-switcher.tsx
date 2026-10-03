"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Input } from "@/components/ui/input";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { switcherProjects } from "@/lib/shell/switcher";

export type SwitcherProject = { slug: string; name: string; archived: boolean; image?: string | null };

const ITEM = '[role="menuitem"], [role="menuitemradio"]';

/**
 * LNB 프로젝트 구역 머리의 전환 메뉴 (2026-09-27 사용자, DESIGN §6.5).
 *
 * ⚠️ **새 Popover·combobox 프리미티브가 아니라 필터 메뉴와 같은 `DropdownMenu`다** (사용자) — 행 모양·hover·체크가 한 벌이다.
 * 지금 프로젝트는 `selected`(`menuitemradio` + `aria-checked`)이고, 행을 고르면 그 프로젝트의 **Home**으로 간다 — 보던 하위 화면은
 * 역할·구획이 다를 수 있어 따라가지 않는다. 보관 프로젝트도 싣고 행 오른쪽에 `/projects` 목록과 같은 `Archived` 배지를 단다
 * (지금 프로젝트면 배지 다음에 체크).
 *
 * ⚠️ **머리의 입력과 Radix 메뉴의 키보드가 부딪힌다** — 메뉴는 글자 키를 typeahead로 먹고 Tab을 막는다. 그래서:
 * - 입력의 키는 Esc(닫기 — Radix가 document에서 듣는다)를 빼고 **메뉴까지 올리지 않는다**. ArrowDown은 첫 항목으로, Enter는 첫 맞는 행이다.
 * - 항목에 포커스가 있을 때 친 글자·Backspace는 typeahead 대신 **입력으로 돌아가 질의를 고친다** — 포인터가 항목 위를 지나며 포커스를
 *   옮긴 뒤에도 치던 것이 이어진다. 첫 항목의 ArrowUp은 입력으로 간다.
 * ⚠️ `SearchInput`을 쓰지 않는다 — 그쪽은 Enter에 제출하는 URL 검색이고, 여기는 칠 때마다 좁히는 로컬 필터다.
 */
export function ProjectSwitcher({ projects, current }: { projects: readonly SwitcherProject[]; current: string | null }) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const shown = switcherProjects(projects, q);
  const firstItem = () => content.current?.querySelector<HTMLElement>(ITEM) ?? null;
  /*
    ⚠️ **포인터가 항목 위를 지나도 포커스를 옮기지 않는다** — Radix는 pointermove에 항목으로, pointerleave에 콘텐츠로 포커스를
    옮기는데(defaultPrevented면 건너뛴다) 그러면 입력에서 치던 한글 조합의 첫 글자가 `Process` 키로 항목에 떨어져 사라진다.
    hover 면은 `DropdownMenuItem`의 `hover:bg-accent`가 그대로 그린다. 키보드 이동은 Arrow가 든다.
  */
  const keepInputFocus = {
    onPointerMove: (event: PointerEvent<HTMLElement>) => event.preventDefault(),
    onPointerLeave: (event: PointerEvent<HTMLElement>) => event.preventDefault(),
  };

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") return;
    event.stopPropagation();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      firstItem()?.focus();
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
      event.preventDefault();
      // 맞는 프로젝트가 없으면 아무것도 안 한다 — 첫 항목이 New project일 때 그리로 보내지 않는다.
      if (shown.length > 0) content.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.click();
    }
  }

  function onContentKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target === input.current) return;
    // ArrowUp은 항목의 roving 처리가 이미 preventDefault한 뒤에 온다 — 아래 거름보다 먼저 본다.
    if (event.key === "ArrowUp" && event.target === firstItem()) {
      event.preventDefault();
      input.current?.focus();
      return;
    }
    // ⚠️ 항목이 이미 처리한 키(Space·Enter = 선택)는 질의로 옮기지 않는다 — 안 거르면 다음에 열 때 입력에 공백이 남는다.
    if (event.defaultPrevented) return;
    const typing = event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (typing || event.key === "Backspace") {
      // preventDefault가 Radix의 typeahead를 건너뛰게 한다(composeEventHandlers).
      event.preventDefault();
      setQ((prev) => (typing ? prev + event.key : prev.slice(0, -1)));
      input.current?.focus();
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setQ(""); }}>
      <DropdownMenuTrigger asChild>
        {/* ⚠️ 머리 줄은 32다 — 24 버튼을 `-my-0.5`로 그 안에 넣는다(안 그러면 머리만 36이 된다). */}
        <Button size="icon-xs" variant="ghost" aria-label={m.common.nav.projectSwitcher.label} className="-my-0.5 ml-auto shrink-0 rounded-sm">
          <ChevronsUpDown className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={content}
        align="start"
        className="w-64"
        onKeyDown={onContentKeyDown}
        // ⚠️ 한글 조합 중 Esc는 조합을 취소하는 키다 — 메뉴를 닫지 않는다(Radix는 document capture에서 들어 stopPropagation이 안 닿는다).
        onEscapeKeyDown={(event) => { if (event.isComposing || event.keyCode === 229) event.preventDefault(); }}
      >
        <div className="flex items-center gap-2 px-2 pb-1">
          {/*
            ⚠️ **열리면 포커스는 입력이다** — `autoFocus`가 커밋 때 입력에 포커스를 두면, Radix `FocusScope`는 이미 안에 포커스가
            있는 것을 보고 자기 자동 포커스(콘텐츠·첫 항목)를 건너뛴다. "열면 검색 입력에 포커스" 테스트가 그 경로를 잰다.
          */}
          <div className="flex min-w-0 flex-1">
            <Input width="full" size="sm" variant="bare"
              ref={input}
              autoFocus
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={m.common.nav.projectSwitcher.search}
              aria-label={m.common.nav.projectSwitcher.search}
            />
          </div>
          <Kbd>{m.common.keys.esc}</Kbd>
        </div>
        <DropdownMenuSeparator />
        {shown.length === 0 ? (
          <p className="text-muted-foreground px-3 py-1.5 text-sm">{m.common.nav.projectSwitcher.empty}</p>
        ) : (
          shown.map((project) => (
            <DropdownMenuItem key={project.slug} asChild selected={project.slug === current} {...keepInputFocus}>
              <Link href={routes.project(project.slug)}>
                <ProjectThumbnail name={project.name} src={project.image} size="xs" />
                {/* ⚠️ 이름이 남는 폭을 먹는다(`flex-1`) — 그래야 배지 뒤의 `Check`(`ml-auto`)가 배지에 붙는다. 둘 다 `ml-auto`면 빈 폭을 나눠 갖는다. */}
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {project.archived && (
                  // ⚠️ `/projects` 행 칩과 같은 형·같은 키다(`project-list.tsx`의 `archived` 칩) — 두 벌이면 하나가 낡는다.
                  <StatusBadge state="archived" className="shrink-0 px-2" />
                )}
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild {...keepInputFocus}>
          <Link href={routes.newProject()}>
            <Plus className="size-4" aria-hidden />
            {m.common.nav.newProject}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
