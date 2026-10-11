"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from "react";

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
import { useMessages } from "@/components/i18n/messages-provider";
import { ProjectMenuItem } from "@/components/shell/project-menu-item";
import { isImeComposing } from "@/lib/keyboard";
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
 *
 * `trigger`는 접힌 LNB 레일의 썸네일 버튼이다(2026-10-04 사용자) — 없으면 머리 오른쪽 끝의 chevron 버튼이다. 메뉴는 한 벌이다.
 * ⚠️ **레일에서는 오른쪽으로 연다** — 40 레일 아래로 열면 메뉴가 레일 항목을 덮는다. 머리에서는 아래다(펼친 LNB 폭 안에 선다).
 */
export function ProjectSwitcher({
  projects,
  current,
  trigger,
  size = "head",
}: {
  projects: readonly SwitcherProject[];
  current: string | null;
  trigger?: ReactElement;
  /**
   * 기본 트리거의 급 — `head`는 LNB 머리 줄(32) 안의 24, `drawer`는 서랍 머리 줄(40) 안의 32다(responsive-app 시안 AT1b-switch — 트리거만 키우고
   * 메뉴는 같은 `w-64`가 아래로 연다. 터치 44는 `icon-md`의 `::after`).
   */
  size?: "head" | "drawer";
}) {
  const m = useMessages();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLDivElement>(null);
  /** 열린 뒤 아직 입력에 착지하지 못했나 — 서랍 안에서 메뉴 컨테이너가 받은 첫 포커스를 입력으로 넘길 때 한 번 쓴다(#222). 닫으면 지운다. */
  const opening = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /**
   * 서랍 형의 메뉴 정렬 보정 — 머리 줄 왼쪽에서 트리거 왼쪽까지(음수). 열 때마다 잰다(#223).
   * ⚠️ 트리거가 40 행의 오른쪽 끝이라 `align=start`를 그대로 두면 256 메뉴가 319 서랍 오른쪽 경계를 넘어 배경 위로 나온다(375 실측 +40).
   * 시안 AT1b-375-switch는 서랍 안에서 아래로, 행 왼쪽 시작선에 선다. 고정 LNB(`head`)는 지금처럼 트리거에 붙는다.
   */
  const [alignOffset, setAlignOffset] = useState(0);
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
    } else if (event.key === "Enter" && !isImeComposing(event.nativeEvent)) {
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
    <DropdownMenu onOpenChange={(open) => {
      opening.current = open;
      if (open && size === "drawer") setAlignOffset(rowStartOffset(triggerRef.current));
      if (!open) setQ("");
    }}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          // ⚠️ 머리 줄은 32다 — 24 버튼을 `-my-0.5`로 그 안에 넣는다(안 그러면 머리만 36이 된다).
          <Button ref={triggerRef} size={size === "drawer" ? "icon-md" : "icon-xs"} variant="ghost" aria-label={m.common.nav.projectSwitcher.label} className={size === "drawer" ? "ml-auto shrink-0 rounded-sm" : "-my-0.5 ml-auto shrink-0 rounded-sm"}>
            <ChevronsUpDown className="size-4" aria-hidden />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={content}
        side={trigger ? "right" : "bottom"}
        align="start"
        alignOffset={size === "drawer" ? alignOffset : undefined}
        className="w-64"
        onKeyDown={onContentKeyDown}
        /*
          ⚠️ **서랍 안에서 열면 메뉴 컨테이너가 포커스를 받는다 — 그때만 입력으로 돌린다** (#222). `autoFocus`는 커밋 때(메뉴 `FocusScope`의
          effect보다 먼저) 입력에 포커스를 주는데, LNB 서랍(Dialog) 안이면 아직 갇혀 있던 서랍의 `FocusScope`가 그 focusin을 "밖"으로 읽어
          포커스를 되가져가고, 메뉴는 안에 포커스가 없다며 자기 컨테이너(role=menu)에 포커스를 세운다. 열린 직후 그 컨테이너 자신이 받은
          포커스만 입력으로 넘긴다 — 고정 LNB에서는 `autoFocus`가 이미 입력에 있어 이 길이 안 돈다(`lg` 이상 동작 불변).
          ⚠️ **`onOpenAutoFocus`를 쓰지 않는다** — Radix 메뉴의 비공개 prop(`MenuContentImplPrivateProps`)이라 타입에서 빠져 있고 언제든 바뀐다.
        */
        onFocus={(event) => {
          if (!opening.current || event.target !== event.currentTarget) return;
          opening.current = false;
          input.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 px-2 pb-1">
          {/*
            ⚠️ **열리면 포커스는 입력이다** — `autoFocus`가 커밋 때 입력에 포커스를 두면, Radix `FocusScope`는 이미 안에 포커스가
            있는 것을 보고 자기 자동 포커스(콘텐츠·첫 항목)를 건너뛴다. "열면 검색 입력에 포커스" 테스트가 그 경로를 잰다. 서랍 안은 위 `onFocus`가 잇는다.
          */}
          <div className="flex min-w-0 flex-1">
            <Input width="full" size="sm" variant="bare"
              ref={input}
              autoFocus
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={m.common.nav.projectSwitcher.search.placeholder}
              aria-label={m.common.nav.projectSwitcher.search.label}
            />
          </div>
          <Kbd>{m.common.keys.esc}</Kbd>
        </div>
        <DropdownMenuSeparator />
        {shown.length === 0 ? (
          <p className="text-muted-foreground px-3 py-1.5 text-sm">{m.common.nav.projectSwitcher.empty(q)}</p>
        ) : (
          shown.map((project) => (
            <ProjectMenuItem key={project.slug} project={project} selected={project.slug === current} {...keepInputFocus} />
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

/** 트리거가 앉은 구역 머리 줄의 왼쪽까지 거리(음수) — 메뉴를 그 시작선에 세운다(서랍 형, #223). 머리 줄 밖이면 0(트리거에 붙는다). */
export function rowStartOffset(trigger: HTMLElement | null): number {
  const row = trigger?.closest<HTMLElement>("[data-zone-head]");
  if (trigger == null || row == null) return 0;
  return row.getBoundingClientRect().left - trigger.getBoundingClientRect().left;
}
