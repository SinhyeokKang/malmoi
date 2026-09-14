"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { activeProject, navFooterItems, navZones, type NavItem, type NavProject } from "@/lib/shell/nav";
import { cn } from "@/lib/utils";

/**
 * 앱 셸의 사이드바 (8-2 골격 → **8-3이 시안 `212:944`에 맞췄다**).
 *
 * ⚠️ **패널이 아니다.** 헤더와 마찬가지로 캔버스 위에 그냥 얹힌다(배경·border·그림자 0) — 흰
 * 패널은 콘텐츠와 오른쪽 패널 둘뿐이고, 여기에 배경을 주면 그 대비가 무너진다 (규약 3.5).
 * 그래서 항목의 hover·선택이 **배경 알파**다: `--accent`는 `--muted`와 같은 값이라(DESIGN §2.1)
 * 캔버스 위에서 보이지 않고, `bg-foreground/…`는 어느 표면에서도 성립한다.
 *
 * ⚠️ **접기가 없다** (8-3 사용자 결정 — 시안에 없다). 그것이 사라지면서 아이콘 전용 레일도 함께
 * 사라졌고, **레일에서만 렌더되던 툴팁도 없어졌다** — 2026-09-08에 셸을 죽였던 그 자리다
 * (소비자가 0이 되어 2026-09-11에 `Tooltip` 프리미티브 자체를 걷어냈다 — **조상 provider를 요구하는
  * Radix 컴포넌트는 프리미티브가 자기 provider를 든다**는 교훈은 POSTMORTEM 2026-09-08에 남아 있고,
  * 다음에 그런 컴포넌트를 들일 때 그 확인을 한 번 한다).
 *
 * ⚠️ **반응형 분기가 0개다** (8단계 규약 3 — 최소 대응 너비 1280).
 *
 * ⚠️ **항목 노출은 편의이고 차단이 아니다** (design §2). EDITOR에게 Project settings를 안 보이는 것은
 * 없는 문을 안 보이게 하는 것뿐이고, URL 직접 진입은 페이지의 `requireProjectAccess`가 막는다.
 *
 * ⚠️ **pathname에서 뽑은 slug는 표시용이다** — `activeProject`가 그것을 **내 멤버십 목록 안에서**
 * 찾고 없으면 컨텍스트가 없다. 데이터 접근은 여전히 각 페이지가 판정한 `projectId`로만 한다.
 */
export function Sidebar({
  memberships,
  userName,
  signOut,
}: {
  memberships: NavProject[];
  userName: string;
  signOut: () => void;
}) {
  const pathname = usePathname();
  const project = activeProject(pathname, memberships);
  const zones = navZones(project, { userName, projectCount: memberships.length });

  return (
    <aside
      // 자기 안에서 스크롤한다 — 항목이 늘어도 문서를 밀지 않는다 (malmoi#13).
      //
      // ⚠️ **폭이 여기 없다.** 옛 `w-60 shrink-0` 자리는 `components/shell/shell-panels.tsx`의
      // `Panel`이 든다(200~320, 기본 240) — 폭이 두 곳에 있으면 드래그가 고정 폭에 덮인다.
      className="flex h-full flex-col gap-2 overflow-y-auto p-1"
    >
      {/*
        **구역 둘** (PRODUCT §7.7). ⚠️ **라벨이 이름 그대로다** — 사용자 축은 사용자 이름, 프로젝트 축은
        프로젝트 이름(8-3, 시안). 6b-4의 `Your work` 라벨과 6a의 프로젝트 스위처를 함께 대체했다:
        스위처가 사라지면서 **프로젝트를 옮기는 길이 목록 하나로 통일됐다**(`New project`를 뺀 것과
        같은 방향이다 — 진입점이 하나면 "어디서 눌렀나"에 따라 다른 곳에 착지할 수 없다).
      */}
      {zones.map((zone, index) => (
        <nav
          key={zone.key}
          // ⚠️ **구역 라벨이 `<p>`라 접근성 트리에서 이름이 아니다** — 그러면 landmark 둘이 구별되지
          // 않아 "구역을 이름으로 말한다"가 스크린리더 사용자에게만 성립하지 않는다.
          aria-label={zone.label}
          className={cn("flex flex-col gap-0.5", index === 0 ? undefined : "border-border border-t pt-2")}
        >
          <p className="text-foreground truncate py-1.5 text-sm font-medium">{zone.label}</p>
          {zone.items.map((item) => (
            <Item key={item.key} item={item} active={isActive(pathname, item)} />
          ))}
        </nav>
      ))}

      {/*
        하단 전역 — 라우트가 아니라 "앱을 벗어나는 것"이라 구역 밖이다. Help는 `/docs`로 간다.
        ⚠️ **`<nav>`가 아니다** — 두 항목의 성격이 갈려(문서 링크 / 폼 제출) 하나로 묶을 이름이 없다.
      */}
      <div className="mt-auto flex flex-col gap-0.5 pt-2">
        {navFooterItems().map((item) => (
          <Item key={item.key} item={item} active={isActive(pathname, item)} />
        ))}
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            // ⚠️ hover 알파가 위 링크 항목과 같아야 한다 — 하단 둘 중 하나만 진하면 그 차이가 상태로 읽힌다.
            className="text-foreground hover:bg-foreground/[0.03] h-auto w-full justify-start gap-2 rounded-sm p-1.5"
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              <LogOut className="size-4" aria-hidden />
            </span>
            <span className="truncate">{m.common.nav.signOut}</span>
          </Button>
        </form>
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

/** 항목 하나 — 시안 치수는 `p-6 · gap-8 · radius-8 · 아이콘 16 · 14px`이다. */
function Item({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-foreground flex items-center gap-2 rounded-sm p-1.5 text-sm",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        /**
         * ⚠️ hover와 선택이 **같은 알파면** 포인터 아래의 항목이 선택된 것처럼 보인다 — 한 단계 벌린다.
         *
         * ⚠️ **둘 다 한 단계 내렸다** (2026-09-11 사용자 — `/10`·`/5`에서). 사이드바는 배경도
         * border도 없이 **캔버스 위에 얹혀** 있어서(§6.5), 같은 알파라도 흰 패널 위보다 진하게
         * 보인다. `[0.03]`은 프로젝트 목록 행의 hover와 같은 값이라 임의값이 늘지 않는다.
         */
        active ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.03]",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Icon className="size-4" aria-hidden />
      </span>
      {/*
        ⚠️ **선택의 굵기가 라벨에만 붙는다** (2026-09-11 사용자). `<Link>`에 두면 `Badge`가 그것을
        **상속해** 개수까지 굵어진다 — 배지는 weight를 지정하지 않아 자기가 앉은 자리를 따르기
        때문이다. 선택은 **라벨**의 성질이지 행 전체의 성질이 아니다.
      */}
      <span className={cn("min-w-0 truncate", active && "font-medium")}>{item.label}</span>
      {/*
        ⚠️ **0도 보인다** — `undefined`와 `0`이 다르다. 프로젝트가 없다는 사실은 그 자체로 정보이고,
        `item.badge && …`로 쓰면 0이 falsy라 조용히 사라진다.
      */}
      {item.badge !== undefined && (
        <Badge variant="neutral" className="ml-auto shrink-0">
          {item.badge}
        </Badge>
      )}
    </Link>
  );
}
