"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";

import { ProjectThumbnail } from "@/components/projects/project-thumbnail";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
 * 역할·구획이 다를 수 있어 따라가지 않는다.
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
  const shown = switcherProjects(projects, current, q);
  const firstItem = () => content.current?.querySelector<HTMLElement>(ITEM) ?? null;
  /*
    ⚠️ **열리면 포커스는 입력이다** — Radix 메뉴는 열 때 콘텐츠(포인터)나 첫 항목(키보드)에 포커스를 둔다. `onOpenAutoFocus`는
    `Menu.Content`가 받는 prop인데 `DropdownMenuContent`의 **타입만** 그것을 빼 두어 형으로 넘긴다(런타임은 그대로 전달된다).
    radix-ui 버전을 올려 이 경로가 사라지면 `project-switcher.test.tsx`의 "열면 검색 입력에 포커스"가 red다.
  */
  const openFocus = { onOpenAutoFocus: (event: Event) => { event.preventDefault(); input.current?.focus(); } } as Record<string, unknown>;

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
    const typing = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (typing || event.key === "Backspace") {
      // preventDefault가 Radix의 typeahead를 건너뛰게 한다(composeEventHandlers).
      event.preventDefault();
      setQ((prev) => (typing ? prev + event.key : prev.slice(0, -1)));
      input.current?.focus();
    } else if (event.key === "ArrowUp" && event.target === firstItem()) {
      event.preventDefault();
      input.current?.focus();
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setQ(""); }}>
      <DropdownMenuTrigger asChild>
        {/* ⚠️ 머리 줄은 32다 — 24 버튼을 `-my-0.5`로 그 안에 넣는다(안 그러면 머리만 36이 된다). */}
        <Button variant="ghost" aria-label={m.common.nav.projectSwitcher.label} className="-my-0.5 ml-auto size-6 shrink-0 rounded-sm p-0">
          <ChevronsUpDown className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={content}
        align="start"
        className="w-64"
        {...openFocus}
        onKeyDown={onContentKeyDown}
      >
        <div className="flex items-center gap-2 px-2 pb-1">
          <Input
            ref={input}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={m.common.nav.projectSwitcher.search}
            aria-label={m.common.nav.projectSwitcher.search}
            className="h-8 min-w-0 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
          />
          <kbd className="border-border text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 font-sans text-xs">
            {m.common.nav.projectSwitcher.escHint}
          </kbd>
        </div>
        <DropdownMenuSeparator />
        {shown.length === 0 ? (
          <p className="text-muted-foreground px-3 py-1.5 text-sm">{m.common.nav.projectSwitcher.empty}</p>
        ) : (
          shown.map((project) => (
            <DropdownMenuItem key={project.slug} asChild selected={project.slug === current}>
              <Link href={routes.project(project.slug)}>
                <ProjectThumbnail name={project.name} src={project.image} size={16} />
                <span className="min-w-0 truncate">{project.name}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={routes.newProject()}>
            <Plus className="size-4" aria-hidden />
            {m.common.nav.newProject}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
