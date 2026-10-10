import { ChevronsUpDown, Inbox, PanelLeftClose, Plus, Search } from "lucide-react";
import type { ReactNode } from "react";

import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { PUBLIC_HEADER_LINK } from "@/components/public-shell/header";
import { HeaderBar } from "@/components/shell/header-bar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CountBadge } from "@/components/ui/count-badge";
import { navCountLabel } from "@/components/shell/nav-count";
import { buttonClass } from "@/components/ui/button";
import { FIELD_BUTTON_CLASS } from "@/components/ui/field-button";
import { Kbd } from "@/components/ui/kbd";
import { MalmoiMark } from "@/components/ui/malmoi-mark";
import type { Messages } from "@/lib/i18n";
import { navFooterItems, navZones, type NavItem } from "@/lib/shell/nav";
import { cn } from "@/lib/utils";

/**
 * 목업 안의 앱 셸 — 헤더 44 · LNB 240 · 핸들 8 · `ContentPanel`을 **정적 복제**로 그린다(DESIGN §6.615 — 실제 셸은 Server Action·세션에 묶여 있다).
 * 치수는 `app/(edit)/layout.tsx`(`px-2 pt-1.5 pb-2` + 헤더 `mb-1.5`) · `components/shell/shell-panels.tsx`(기본 240 · 핸들 `w-2`) · `sidebar.tsx`와 같다.
 *
 * ⚠️ **구역·항목·배지를 실제 판정(`navZones` · `navFooterItems`)에서 뽑는다** — 사용자 구역(Projects · Inbox · MCP connector · Preferences · Account, 머리 줄 없음 — Inbox 안 읽음 배지는 탭 안 store 값이라 목업엔 없다)과 프로젝트 구역,
 * 하단 목록까지 사이드바와 같은 목록이다. 손으로 나열하면 사이드바가 바뀔 때 목업만 낡는다(옛 목업엔 계정 구역이 없었다).
 *
 * ⚠️ **인터랙티브 태그를 두지 않는다** — 프레임은 `aria-hidden` + `inert`이지만 jsdom이 `inert`를 모르므로 태그 수로 센다.
 * 링크·폼 자리는 `<span>`에 같은 클래스를 입힌다.
 */
/**
 * LNB 하단 목록의 **출처 한 곳** — 사이드바 하단(`sidebar.tsx`)이 그리는 항목과 같은 판정이다. ⚠️ Sign out은 하단에서 빠져 아바타
 * 메뉴에만 남는다(MISC 배치, 2026-09-27) — 목업은 그것을 따로 그리지 않는다. 접기 버튼은 실제 사이드바처럼 이 목록 다음에 따로 그린다.
 */
export function AppFrame({ m, children, overlay }: { m: Messages; children: ReactNode; overlay?: ReactNode }) {
  const fixture = m.landing.mockup;
  const zones = navZones(
    m,
    {
      slug: "acme-web",
      name: fixture.project,
      role: "OWNER",
      archived: false,
      counts: { sources: fixture.sources.length, members: fixture.memberCount, keys: fixture.keyCount },
    },
    { userName: fixture.user, projectCount: fixture.projectCount },
  );
  return (
    <div data-landing-shell="" className="bg-canvas relative flex h-full flex-col px-2 pt-1.5 pb-2">
      {/* 앱 셸 헤더(`components/shell/header.tsx`)와 같은 `HeaderBar` — 로고 · 가운데 검색 · 우측 New project · 연한 세로선 · Inbox · 아바타. */}
      {/*
        ⚠️ **헤더 44 · 위 6 · 아래 6이 실물 셸과 같다**(2026-10-05 사용자 — 목업만 40을 지키던 `h-10` 덮기를 걷었다). 위아래 여백이 8 → 6이라
        패널 윗변 56은 옛 목업과 같고 씬 좌표가 움직이지 않는다.
      */}
      <HeaderBar
        className="mb-1.5"
        start={
          <span data-landing-logo="" className="flex size-8 items-center justify-center rounded-sm">
            <MalmoiMark size={32} />
          </span>
        }
        center={
          /* `FieldButton`(`SearchTrigger`)의 `FIELD_BUTTON_CLASS` 그대로다(태그만 `<span>` — 사본 없음, 높이도 실물 44). 수화 전 플랫폼을 모르는 정적 복제라 칩은 Mac 표기 하나로 고정한다. `landing-mockup.test.tsx`가 실물을 렌더해 클래스를 견준다. */
          <span
            data-landing-global-search=""
            className={FIELD_BUTTON_CLASS}
          >
            {/* 글리프 칸만 실물(`[&>svg]:size-4`)과 쓰는 법이 다르다 — 목업 소스 스캐너가 클래스 안의 `>`를 텍스트로 읽는다. 크기는 같은 16이다. */}
            <span aria-hidden className="text-muted-foreground shrink-0">
              <Search className="size-4" />
            </span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-left">{m.search.placeholder}</span>
            <span aria-hidden className="flex w-16 shrink-0 justify-end">
              <Kbd>{m.common.keys.search.mac}</Kbd>
            </span>
          </span>
        }
        end={
          <div data-landing-header-right="" className="flex items-center gap-3">
            <span className={PUBLIC_HEADER_LINK}>
              <Plus className="size-4 shrink-0" aria-hidden />
              {m.common.nav.newProject}
            </span>
            <span aria-hidden className="bg-border-subtle h-5 w-px" />
            {/*
              헤더 Inbox(`components/shell/attention-inbox.tsx`)의 트리거 사본 — 실물과 같은 `buttonClass` + ghost 덮기(`landing-mockup.test.tsx`가 실물을 렌더해 견준다).
              ⚠️ **배지가 없다** — 실물 배지는 페이지를 열 때와 메뉴를 열 때만 다시 읽어 한 이야기(번역 → Publish) 동안 바뀌지 않고, 숫자가 서면
              씬의 주인공(Publish 배지)과 다투는 둘째 배지가 된다.
            */}
            <span data-landing-inbox="" className={cn(buttonClass({ variant: "ghost", size: "icon-md" }), "text-foreground hover:bg-foreground/[0.03] aria-expanded:bg-foreground/[0.03]")}>
              <Inbox className="size-4" aria-hidden />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full">
              <Avatar name={fixture.user} size={32} />
            </span>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div data-landing-lnb="" className="flex h-full w-[240px] shrink-0 flex-col gap-2 overflow-hidden p-1">
          {zones.map((zone, index) => (
            <div key={zone.key} data-landing-zone={zone.key} className={cn("flex flex-col gap-0.5", index > 0 && "border-border border-t pt-2")}>
              {/* 머리 줄은 프로젝트 구역에만 있다 — 사이드바와 같다(2026-09-30). */}
              {zone.key === "project" && (
                <p className={cn(ROW, "text-foreground font-medium")}>
                  <ProjectThumbnail name={zone.label} size="xs" />
                  <span className="min-w-0 truncate">{zone.label}</span>
                  {/* 프로젝트 전환 트리거(`components/shell/project-switcher.tsx`) — 같은 `Button size="icon-xs" variant="ghost"` 형 · 글리프 16 · 머리 오른쪽 끝. 메뉴는 그리지 않는다. */}
                  <span data-landing-switcher="" className={cn(buttonClass({ variant: "ghost", size: "icon-xs" }), "-my-0.5 ml-auto shrink-0 rounded-sm")}>
                    <ChevronsUpDown className="size-4" aria-hidden />
                  </span>
                </p>
              )}
              {zone.items.map((item) => (
                <Item key={item.key} m={m} item={item} active={item.key === "translations"} />
              ))}
            </div>
          ))}
          <div data-landing-zone="footer" className="mt-auto flex flex-col gap-0.5 pt-2">
            {navFooterItems(m).map((item) => (
              <Item key={item.key} m={m} item={item} active={false} />
            ))}
            <span
              data-landing-collapse=""
              className={cn(buttonClass({ variant: "ghost" }), "text-foreground flex h-8 items-center justify-start gap-2 rounded-sm px-2 text-sm font-normal whitespace-nowrap hover:bg-foreground/[0.03] hover:text-foreground")}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                <PanelLeftClose className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 truncate">{m.common.nav.collapseSidebar}</span>
            </span>
          </div>
        </div>
        {/* 리사이즈 핸들 자리 — 실제 셸의 8px 투명 스트립이다. */}
        <div className="w-2 shrink-0" />
        <div className="border-border-subtle bg-background shadow-low flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">{children}</div>
      </div>
      {overlay !== undefined && (
        <div className="bg-scrim/32 absolute inset-0 flex items-center justify-center backdrop-blur-[6px]">{overlay}</div>
      )}
    </div>
  );
}

/**
 * `sidebar.tsx`의 `ROW`와 같은 문자열 — 그 파일은 `"use client"`라 서버 컴포넌트인 목업이 값을 import할 수 없다(클라이언트 참조가 된다).
 * `landing-mockup.test.tsx`가 토큰을 고정한다.
 */
const ROW = "flex h-8 items-center gap-2 rounded-sm px-2 text-sm whitespace-nowrap";

/** `sidebar.tsx`의 `Item`과 같은 클래스 — 선택은 면(알파) 하나로만 말한다. */
function Item({ m, item, active }: { m: Messages; item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <span data-landing-nav={item.key} className={cn(ROW, "text-foreground", active && "bg-foreground/[0.07]")}>
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 truncate">{item.label}</span>
      {/* 개수는 실물처럼 `CountBadge`(0이면 서지 않는다 · 숫자 `aria-hidden` + sr 문장)이고 문자열 배지(버전)는 `Badge`다. */}
      {typeof item.badge === "number" ? (
        <CountBadge count={item.badge} label={navCountLabel(m, item.key)?.(item.badge) ?? String(item.badge)} className="ml-auto shrink-0" />
      ) : item.badge !== undefined && (
        <Badge variant="soft-neutral" className="ml-auto shrink-0">
          {item.badge}
        </Badge>
      )}
    </span>
  );
}
