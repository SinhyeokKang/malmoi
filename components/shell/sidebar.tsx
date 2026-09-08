"use client";

import { ChevronsUpDown, LayoutGrid, LogOut, Menu, PanelLeft, Plus, X } from "lucide-react";
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
import { activeProject, projectSections, type NavProject } from "@/lib/shell/nav";
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
          "bg-muted border-border flex shrink-0 flex-col border-r",
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

        {project !== null && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                aria-label={m.common.nav.switchProject}
                // ⚠️ `ring-offset-1`은 **muted 표면 위**라서 붙는다 — `--ring == --border`라 사이드바에서
                // 링이 약하다 (DESIGN §7).
                className="hover:bg-background/60 mx-2 my-1 h-auto justify-start gap-2 px-2 py-2 focus-visible:ring-offset-1"
              >
                <Avatar name={project.name} shape="square" size={24} />
                {!rail && (
                  <>
                    <span className="truncate font-medium">{project.name}</span>
                    <ChevronsUpDown className="text-muted-foreground ml-auto size-4" aria-hidden />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {memberships.map((membership) => (
                <DropdownMenuItem key={membership.slug} asChild selected={membership.slug === project.slug}>
                  <Link href={routes.translations(membership.slug)}>{membership.name}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {project !== null && (
          <nav className="mt-1">
            {projectSections(project.role).map((section) => (
              <Item
                key={section.key}
                href={section.href(project.slug)}
                label={section.label}
                icon={section.icon}
                active={pathname.startsWith(section.href(project.slug))}
                rail={rail}
              />
            ))}
          </nav>
        )}

        <div className="border-border mx-4 my-3 border-t" />

        <nav>
          <Item
            href={routes.projects()}
            label={m.common.nav.allProjects}
            icon={LayoutGrid}
            active={pathname === routes.projects()}
            rail={rail}
          />
          <Item
            href={routes.newProject()}
            label={m.common.nav.newProject}
            icon={Plus}
            active={pathname === routes.newProject()}
            rail={rail}
          />
        </nav>

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
