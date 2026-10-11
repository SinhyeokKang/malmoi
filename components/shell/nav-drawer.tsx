"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { useMessages } from "@/components/i18n/messages-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DrawerContent } from "@/components/ui/dialog";
import { MalmoiMark } from "@/components/ui/malmoi-mark";
import { routes } from "@/lib/routes";
import { WIDE_QUERY } from "@/lib/shell/breakpoint";
import type { NavProject } from "@/lib/shell/nav";

import { useNarrowHandoff } from "./narrow-handoff";
import { Sidebar, SidebarDrawerFooter } from "./sidebar";
import { SidebarCollapseContext, type SidebarCollapse } from "./sidebar-collapse";

/** 앱 메뉴 버튼 표식 — 좁아지며 숨는 고정 LNB·헤더 묶음이 포커스를 넘길 자리다. 헤더에 하나다. */
export const APP_NAV_MENU = "[data-app-nav-menu]";
/** 숨는 고정 LNB의 래퍼 표식(`shell-panels.tsx`) — 넓어지며 서랍이 닫힐 때 포커스를 받을 자리를 여기서 찾는다. */
export const APP_SIDEBAR = "[data-app-sidebar]";

/** 서랍 안 Sidebar의 접힘 문맥 — 늘 펼침이고 토글은 아무것도 안 한다(데스크톱 접힘·쿠키와 무관하다 — design §2). */
const DRAWER_COLLAPSE: SidebarCollapse = { collapsed: false, toggle: () => {} };

/**
 * **`lg` 미만 앱 헤더의 메뉴 버튼 + LNB 서랍** (responsive-app design §2 · 시안 AT1b). 그릇은 공개 셸과 같은 `DrawerContent`이고 안은 지금 LNB
 * (`Sidebar`의 `drawer` 형)다 — 구역 둘·항목·배지·순서·글리프가 같다.
 *
 * ⚠️ **검색·Inbox·계정은 서랍에 넣지 않는다** — 헤더에 한 벌이다(검색은 인스턴스마다 ⌘K 리스너, Inbox는 마운트마다 배지 Action).
 * ⚠️ **열린 동안만 `lg` 리스너를 단다** — 넓어지면 닫고 고정 LNB의 대응 항목으로 포커스를 옮긴다. 메뉴 버튼은 그때 `lg:hidden`이라 Radix 기본
 * 복귀로 두면 `body`로 빠진다(POSTMORTEM 2026-09-24). 공개 `NavDrawer`와 같은 계약이고 대상만 헤더 내비가 아니라 고정 LNB다.
 * ⚠️ **링크로 닫히면 메뉴 버튼으로 돌려주지 않는다** — 도착한 화면이 포커스를 가진다. 앱 셸은 레이아웃이 헤더를 들어 서랍이 이동 뒤에도
 * 마운트돼 있으므로 닫기를 여기서 한다. 링크는 서랍 몸통·바닥·머리 로고와 **포털로 열린 전환 메뉴**까지 다 있어서 React 트리의 클릭 위임 하나로
 * 받는다(포털 안의 이벤트도 React 조상으로 올라온다) — 항목마다 닫기를 꿰지 않는다.
 */
export function AppNavDrawer({ memberships, userName }: { memberships: readonly NavProject[]; userName: string }) {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  // 닫힘 뒤 포커스를 정할 자리 — `"link"`면 도착한 화면, 요소면 넓어진 고정 LNB의 그 자리, `null`이면 메뉴 버튼.
  const landing = useRef<"link" | HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // ⚠️ jsdom에는 `matchMedia`가 없다 — 없는 환경은 폭이 바뀌지 않는 것으로 읽는다.
    const query = window.matchMedia?.(WIDE_QUERY);
    if (query == null) return;
    const onChange = (event: { matches: boolean }) => {
      if (!event.matches) return;
      landing.current = wideTarget(document.activeElement);
      setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open]);

  const closeOnLink = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || event.target.closest("a[href]") === null) return;
    landing.current = "link";
    setOpen(false);
  };

  return (
    <>
      {/* 열림 면은 Inbox 트리거와 같은 3%다(공개 PT1b와 같은 버튼). */}
      <Button ref={menu} size="icon-md" variant="ghost" data-app-nav-menu="" aria-label={m.landing.shell.openNav} aria-haspopup="dialog" aria-expanded={open}
        className="text-foreground hover:bg-foreground/[0.03] aria-expanded:bg-foreground/[0.03] lg:hidden" onClick={() => setOpen(true)}>
        <Menu className="size-4" aria-hidden />
      </Button>
      {/* `contents` — 클릭 위임만 든다. 배치에 끼지 않는다. */}
      <div className="contents" onClick={closeOnLink}>
        <Dialog open={open} onOpenChange={setOpen}>
          <DrawerContent
            title={m.landing.shell.nav}
            start={
              <Link href={routes.projects()} aria-label={m.common.nav.appHome}
                className="focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none">
                <MalmoiMark size={32} />
              </Link>
            }
            pinned={<SidebarDrawerFooter memberships={memberships} />}
            onCloseAutoFocus={(event) => {
              const target = landing.current;
              landing.current = null;
              event.preventDefault();
              if (target === "link") return;
              // 기본 복귀를 메뉴 버튼으로 명시한다(공개 #213과 같은 근거 — 트리거 없이 연 Dialog라 "최근 포커스 기록"에 맡기지 않는다).
              (target ?? menu.current)?.focus();
            }}
          >
            <SidebarCollapseContext.Provider value={DRAWER_COLLAPSE}>
              <Sidebar drawer memberships={memberships} userName={userName} />
            </SidebarCollapseContext.Provider>
          </DrawerContent>
        </Dialog>
      </div>
    </>
  );
}

/** 넓어진 셸에서 포커스를 받을 자리 — 서랍에서 포커스가 있던 링크와 같은 목적지의 고정 LNB 항목, 없으면 그 LNB의 현재 항목이다. */
function wideTarget(active: Element | null): HTMLElement | null {
  const sidebar = document.querySelector<HTMLElement>(APP_SIDEBAR);
  if (sidebar === null) return null;
  const href = active instanceof HTMLAnchorElement ? active.getAttribute("href") : null;
  return [...sidebar.querySelectorAll<HTMLAnchorElement>("a[href]")].find((link) => href !== null && link.getAttribute("href") === href)
    ?? sidebar.querySelector<HTMLElement>('[aria-current="page"]');
}

/**
 * **`lg` 이상에서만 보이는 헤더 묶음**(`New project` 링크 · 세로선) — 좁아지며 숨을 때 그 안에 포커스가 있었으면 메뉴 버튼으로 옮긴다
 * (`useNarrowHandoff`). 숨김은 CSS(`max-lg:hidden`)가 한다. 공개 헤더의 `WideOnly`와 같은 형이고 대상만 앱 메뉴 버튼이다.
 */
export function AppWideOnly({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const handoff = useNarrowHandoff(ref, APP_NAV_MENU);
  return <div ref={ref} className={className} {...handoff}>{children}</div>;
}
