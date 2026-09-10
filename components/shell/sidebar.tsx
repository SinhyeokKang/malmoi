"use client";

import { ChevronsUpDown, LogOut, PanelLeft } from "lucide-react";
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
 * 앱 셸의 사이드바 (8-2 — 시안 `212:944`의 `lnb`).
 *
 * ⚠️ **패널이 아니다.** 헤더와 마찬가지로 캔버스 위에 그냥 얹힌다(배경·border·그림자 0) — 흰
 * 패널은 콘텐츠와 오른쪽 패널 둘뿐이고, 여기에 배경을 주면 그 대비가 무너진다 (규약 3.5).
 * 그래서 항목의 hover·선택이 **배경 알파**다: `--accent`는 `--muted`와 같은 값이라(DESIGN §2.1)
 * 캔버스 위에서 보이지 않고, `bg-foreground/…`는 어느 표면에서도 성립한다.
 *
 * ⚠️ **반응형 분기가 0개다** (8단계 규약 3 — 최소 대응 너비 1280). 6단계의 `xl` 오버레이·햄버거는
 * 1280 고정에서 도달 불가라 죽은 코드였다. `shell-layout.test.ts`가 그것을 상시로 센다.
 *
 * ⚠️ **항목 노출은 편의이고 차단이 아니다** (design §2). EDITOR에게 Settings를 안 보이는 것은 없는
 * 문을 안 보이게 하는 것뿐이고, URL 직접 진입은 페이지의 `requireProjectAccess`가 막는다.
 *
 * ⚠️ **pathname에서 뽑은 slug는 표시용이다** — `activeProject`가 그것을 **내 멤버십 목록 안에서**
 * 찾고 없으면 컨텍스트가 없다. 데이터 접근은 여전히 각 페이지가 판정한 `projectId`로만 한다.
 *
 * 접힘 상태는 `localStorage`뿐이다 — SSR은 그 값을 모르므로 **마운트 뒤에만** 접힌 모습이 된다
 * (첫 페인트는 펼친 쪽이다 — 반대로 하면 대부분의 사용자가 깜빡임을 본다).
 */
export function Sidebar({ memberships, signOut }: { memberships: NavProject[]; signOut: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // 사생활 보호 모드 등에서 접근 자체가 던진다 — 펼친 기본값으로 둔다.
    }
  }, []);

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
    <aside
      className={cn(
        // 자기 안에서 스크롤한다 — 멤버십·항목이 늘어도 문서를 밀지 않는다 (malmoi#13).
        "flex shrink-0 flex-col gap-2 overflow-y-auto p-1",
        rail ? "w-12" : "w-60",
      )}
    >
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
          className={cn("flex flex-col gap-0.5", index === 0 ? undefined : "border-border border-t pt-2")}
        >
          {zone.key === "project" && project !== null ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label={m.common.nav.switchProject}
                  className="text-foreground hover:bg-foreground/5 h-auto justify-start gap-2 px-1.5 py-1.5"
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
            !rail && <p className="text-foreground py-1.5 text-sm font-medium">{zone.label}</p>
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

      <div className="mt-auto flex flex-col gap-0.5 pt-2">
        <form action={signOut}>
          <RailButton label={m.common.nav.signOut} icon={LogOut} rail={rail} type="submit" />
        </form>
        <RailButton
          label={rail ? m.common.nav.expand : m.common.nav.collapse}
          icon={PanelLeft}
          rail={rail}
          onClick={toggleCollapsed}
        />
      </div>
    </aside>
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
 * 항목 하나 — 시안 치수는 `p-6 · gap-8 · radius-8 · 아이콘 16 · 14px`이다.
 *
 * **접힌 상태에서는 아이콘이 유일한 라벨**이라 Tooltip **과** `aria-label`을 둘 다 든다
 * (DESIGN §7·§6.8) — 툴팁은 포인터에만 뜨고 스크린리더는 그것을 이름으로 읽지 않는다.
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
        "text-foreground flex items-center gap-2 rounded-sm p-1.5 text-sm",
        "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none",
        // ⚠️ hover와 선택이 **같은 알파면** 포인터 아래의 항목이 선택된 것처럼 보인다 — 한 단계 벌린다.
        active ? "bg-foreground/10 font-medium" : "hover:bg-foreground/5",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
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
        "text-foreground hover:bg-foreground/5 h-auto w-full justify-start gap-2 rounded-sm p-1.5 font-light",
        className,
      )}
      {...props}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Icon className="size-4" aria-hidden />
      </span>
      {!rail && <span className="truncate">{label}</span>}
    </Button>
  );
  return rail ? <Tooltip label={label}>{button}</Tooltip> : button;
}
