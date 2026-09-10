"use client";

import { ChevronsUpDown, LogOut, Menu, PanelLeft, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { activeProject, navZones, type NavItem, type NavProject } from "@/lib/shell/nav";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "malmoi:sidebar-collapsed";

/**
 * 앱 셸의 사이드바 (DESIGN §6.5 — GitLab super sidebar 형, 값은 우리 스케일).
 *
 * ⚠️ **항목 노출은 편의이고 차단이 아니다** (design §2). EDITOR에게 Settings를 안 보이는 것은 없는
 * 문을 안 보이게 하는 것뿐이고, URL 직접 진입은 페이지의 `requireProjectAccess`가 `not-found`로 막는다.
 *
 * ⚠️ **pathname에서 뽑은 slug는 표시용이다** — 데이터 접근에 쓰지 않는다. `activeProject`가 그것을
 * **내 멤버십 목록 안에서** 찾고 없으면 컨텍스트가 없다.
 *
 * 접힘 상태는 `localStorage`뿐이다 — 서버에 저장하지 않는다. SSR은 그 값을 모르므로 **마운트 뒤에만**
 * 접힌 모습이 된다(첫 페인트는 펼친 쪽이다 — 반대로 하면 대부분의 사용자가 깜빡임을 본다).
 */
export function Sidebar({ memberships, signOut }: { memberships: NavProject[]; signOut: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // 사생활 보호 모드 등에서 접근 자체가 던진다 — 펼친 기본값으로 둔다.
    }
  }, []);

  // 라우트가 바뀌면 오버레이를 닫는다 — 모바일에서 항목을 눌러도 열린 채면 화면을 가린다.
  useEffect(() => setMobileOpen(false), [pathname]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // 저장 못 해도 이번 세션의 접힘은 동작한다.
    }
  }

  const project = activeProject(pathname, memberships);
  const zones = navZones(project);
  const rail = collapsed;

  return (
    <>
      {/* `xl` 미만의 여는 버튼. top bar가 이 자리를 든다 */}
      <Button
        variant="ghost"
        size="sm"
        className="fixed top-2 left-2 z-30 xl:hidden"
        aria-label={m.common.nav.openMenu}
        onClick={() => setMobileOpen(true)}
      >
        <Menu aria-hidden />
      </Button>

      {mobileOpen && (
        <div
          className="bg-foreground/40 fixed inset-0 z-30 xl:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          // 자기 안에서 스크롤한다 — 멤버십·항목이 늘어도 문서를 밀지 않는다 (malmoi#13).
          "bg-muted border-border flex shrink-0 flex-col overflow-y-auto border-r",
          rail ? "xl:w-12" : "xl:w-60",
          "fixed inset-y-0 left-0 z-40 w-60 xl:static xl:z-auto",
          mobileOpen ? "flex" : "hidden xl:flex",
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between px-4">
          <Link href={routes.projects()} className="text-sm font-medium">
            {rail ? m.common.appName.charAt(0) : m.common.appName}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="xl:hidden"
            aria-label={m.common.nav.closeMenu}
            onClick={() => setMobileOpen(false)}
          >
            <X aria-hidden />
          </Button>
        </div>

        {/*
          **구역 둘** (SAAS §7.7). ⚠️ 헤더가 서로 다르다: 사용자 축은 글자 라벨이고, 프로젝트 축은
          **스위처가 곧 헤더**다 — 이름을 라벨로도 보이고 스위처로도 보이면 같은 값이 두 번 뜬다.
        */}
        {zones.map((zone, index) => (
          <nav
            key={zone.key}
            // ⚠️ **구역 라벨이 `<p>`라 접근성 트리에서 이름이 아니고, 접힌 레일에서는 아예 렌더되지
            // 않는다** — 그러면 landmark 둘이 구별되지 않아 "구역을 이름으로 말한다"가 스크린리더
            // 사용자에게만 성립하지 않는다.
            aria-label={zone.label}
            className={index === 0 ? undefined : "border-border mt-3 border-t pt-1"}
          >
            {zone.key === "project" && project !== null ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    aria-label={m.common.nav.switchProject}
                    // ⚠️ `ring-offset-1`은 **muted 표면 위**라서 붙는다 — `--ring == --border`라 사이드바에서
                    // 링이 약하다 (DESIGN §7).
                    className="hover:bg-background/60 mx-2 my-1 h-auto justify-start gap-2 px-2 py-2 focus-visible:ring-offset-1"
                  >
                    <Avatar name={zone.label} shape="square" size={24} />
                    {!rail && (
                      <>
                        <span className="truncate font-medium">{zone.label}</span>
                        <ChevronsUpDown className="text-muted-foreground ml-auto size-4" aria-hidden />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {memberships.map((membership) => (
                    <DropdownMenuItem key={membership.slug} asChild selected={membership.slug === project.slug}>
                      {/*
                        ⚠️ **배지가 `Link` 안이다.** `asChild`가 걸린 `DropdownMenuItem`은 Slot이라
                        자식을 하나만 받고, 형제를 두면 던져서 셸이 통째로 죽는다
                        (POSTMORTEM 2026-09-09 — `slottable-item.test.ts`가 그 규칙을 상시로 센다).
                      */}
                      <Link href={routes.project(membership.slug)}>
                        {membership.name}
                        {membership.archived && (
                          <span className="text-muted-foreground ml-2 text-xs">{m.projects.archived}</span>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // 접힌 레일에서는 글자가 안 보이므로 구역 라벨도 숨긴다 — 아이콘이 유일한 라벨이다.
              !rail && (
                <p className="text-muted-foreground px-4 pt-2 pb-1 text-xs font-medium tracking-wide uppercase">
                  {zone.label}
                </p>
              )
            )}
            {zone.items.map((item) => (
              <Item
                key={item.key}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(pathname, item)}
                rail={rail}
              />
            ))}
          </nav>
        ))}

        <div className="mt-auto pb-2">
          <form action={signOut}>
            <RailButton label={m.common.nav.signOut} icon={LogOut} rail={rail} type="submit" />
          </form>
          <RailButton
            label={rail ? m.common.nav.expand : m.common.nav.collapse}
            icon={PanelLeft}
            rail={rail}
            onClick={toggleCollapsed}
            className="hidden xl:flex"
          />
        </div>
      </aside>
    </>
  );
}

/**
 * ⚠️ **판정이 축이 아니라 항목에 붙는다** (6b-6). 전에는 "프로젝트 축이면 접두"였는데 Home
 * (`/projects/<slug>`)이 그 축에 들어오면서 그 규칙이 거짓이 됐다 — 그 경로는 같은 프로젝트의
 * **모든** 하위 라우트의 접두라, 번역 화면에 있어도 Home이 선택돼 보인다. 규칙의 실제 근거는
 * **하위 경로가 있는가**이므로 `NavItem.exact`가 그것을 든다 (`lib/shell/nav.ts`).
 */
function isActive(pathname: string, item: NavItem): boolean {
  // 쿼리는 pathname에 없지만 `routes.*`가 붙일 수 있어 잘라낸다.
  const path = item.href.split("?")[0] ?? item.href;
  return item.exact ? pathname === path : pathname.startsWith(path);
}

/**
 * 항목 하나. **접힌 상태에서는 아이콘이 유일한 라벨**이라 Tooltip **과** `aria-label`을 둘 다 든다
 * (DESIGN §7·§6.8) — 툴팁은 포인터에만 뜨고 스크린리더는 그것을 이름으로 읽지 않는다.
 *
 * ⚠️ hover는 배경이 아니라 **글자색**이다 — 사이드바가 `muted` 표면이라 `hover:bg-accent`가 무효다
 * (§2.1). 선택은 흰 알약(`bg-background`)이다.
 */
function Item({
  href,
  label,
  icon: Icon,
  active,
  rail,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  rail: boolean;
}) {
  const link = (
    <Link
      href={href}
      aria-label={rail ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-sm",
        "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none focus-visible:ring-offset-1",
        active
          ? "bg-background text-foreground font-medium shadow-sm"
          : "text-foreground/70 hover:text-foreground",
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center">
        <Icon className="size-4" aria-hidden />
      </span>
      {!rail && <span className="truncate">{label}</span>}
    </Link>
  );
  return rail ? <Tooltip label={label}>{link}</Tooltip> : link;
}

/** 링크가 아닌 항목(로그아웃·접기) — 같은 형이되 `<button>`이다. */
function RailButton({
  label,
  icon: Icon,
  rail,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  rail: boolean;
}) {
  const button = (
    <Button
      variant="ghost"
      aria-label={rail ? label : undefined}
      className={cn(
        "text-foreground/70 mx-2 w-[calc(100%-1rem)] justify-start gap-2 px-2 focus-visible:ring-offset-1",
        className,
      )}
      {...props}
    >
      <span className="flex size-6 shrink-0 items-center justify-center">
        <Icon className="size-4" aria-hidden />
      </span>
      {!rail && <span className="truncate">{label}</span>}
    </Button>
  );
  return rail ? <Tooltip label={label}>{button}</Tooltip> : button;
}
