"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { ProjectSwitcher } from "@/components/shell/project-switcher";
import { Badge } from "@/components/ui/badge";
import { CountBadge } from "@/components/ui/count-badge";
import { Button } from "@/components/ui/button";
import { landFocus } from "@/components/ui/focus";
import { useMessages } from "@/components/i18n/messages-provider";
import type { Messages } from "@/lib/i18n";
import { useInboxUnread } from "@/lib/inbox/unread-store";
import { activeProject, navFooterItems, navZones, type NavItem, type NavProject } from "@/lib/shell/nav";
import { cn } from "@/lib/utils";

import { navCountLabel } from "./nav-count";
import { useSidebarCollapse } from "./sidebar-collapse";

/**
 * 항목 한 줄의 틀 — **펼침·접힘이 같은 틀이다**(2026-09-28 사용자 — 접기가 돌아왔다). 아이콘은 늘 왼쪽 8에 서고, 접힌 레일(40)에서
 * 항목 폭이 32가 되면 `8 + 16 + 8`이라 아이콘이 32 정사각의 한가운데다. 라벨은 폭이 줄며 잘리고 투명해질 뿐 자리를 바꾸지 않는다 —
 * 레이아웃을 갈아 끼우면 전이 중간에 아이콘이 튄다.
 */
const ROW = "flex h-8 items-center gap-2 rounded-sm px-2 text-sm whitespace-nowrap";

/** 접히면 사라지는 것(라벨·배지) — 자리는 남기고 투명해진다. 접근 이름은 DOM에 남은 글자가 그대로 댄다. */
const FADE = "transition-opacity duration-200";

/**
 * LNB의 아이콘 버튼 한 벌 — 접기 토글과 접힌 레일의 프로젝트 트리거가 같은 틀이다(2026-10-04 사용자).
 * `Button`이지 raw `<button>`이 아니다(ui/ 밖 raw 태그 0 게이트) — 항목과 같은 틀(`ROW`)로 덮는다.
 * ⚠️ **`font-normal`로 되누른다** (2026-09-30 사용자) — Button 라벨은 500이지만 LNB 내비는 그 규칙 밖이라 옆 항목(400)과 같아야 한다.
 */
const ICON_BUTTON = cn(ROW, "text-foreground hover:text-foreground h-8 justify-start font-normal hover:bg-foreground/[0.03]");

/** 구역 머리 줄의 접힘 틀 — 높이를 grid 행으로 접어 아래 항목이 튀지 않고 올라온다. `inert`가 접힌 줄을 Tab 순서에서 뺀다. */
const fold = (hidden: boolean) =>
  cn("grid transition-[grid-template-rows,opacity,margin] duration-200", hidden ? "-mb-0.5 grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]");

/**
 * 앱 셸의 사이드바 (8-2 골격 → **8-3이 시안 `212:944`에 맞췄다**).
 *
 * ⚠️ **패널이 아니다.** 헤더와 마찬가지로 캔버스 위에 그냥 얹힌다(배경·border·그림자 0) — 흰
 * 패널은 콘텐츠 패널 하나뿐(2026-09-16에 오른쪽 패널을 지웠다 — DESIGN §6.55)이고, 여기에 배경을 주면 그 대비가 무너진다 (규약 3.5).
 * 그래서 항목의 hover·선택이 **배경 알파**다: `--accent`는 `--muted`와 같은 값이라(DESIGN §2.1)
 * 캔버스 위에서 보이지 않고, `bg-foreground/…`는 어느 표면에서도 성립한다.
 *
 * ⚠️ **접기가 2026-09-28에 돌아왔다** (사용자 — 8-3이 "시안에 없다"며 지웠다). 상태는 셸 패널이 소유하고(`sidebar-collapse.ts`)
 * 여기는 라벨·구역 머리를 숨기기만 한다. **툴팁은 여전히 없다** — 2026-09-11에 `Tooltip` 프리미티브를 걷었고(**조상 provider를
 * 요구하는 Radix 컴포넌트는 프리미티브가 자기 provider를 든다**는 교훈은 POSTMORTEM 2026-09-08), 접힌 항목의 이름은 `title`이 보인다.
 *
 * ⚠️ **반응형 분기가 0개다** (8단계 규약 3 — 최소 대응 너비 1280).
 *
 * ⚠️ **항목 노출은 편의이고 차단이 아니다** (DESIGN §6.5). EDITOR에게 Project settings를 안 보이는 것은
 * 없는 문을 안 보이게 하는 것뿐이고, URL 직접 진입은 페이지의 `requireProjectAccess`가 막는다.
 *
 * ⚠️ **pathname에서 뽑은 slug는 표시용이다** — `activeProject`가 그것을 **내 멤버십 목록 안에서**
 * 찾고 없으면 컨텍스트가 없다. 데이터 접근은 여전히 각 페이지가 판정한 `projectId`로만 한다.
 */
export function Sidebar({ memberships, userName }: { memberships: NavProject[]; userName: string }) {
  const m = useMessages();
  const pathname = usePathname();
  const project = activeProject(pathname, memberships);
  const zones = navZones(m, project, { userName, projectCount: memberships.length, projects: memberships });
  const { collapsed, toggle } = useSidebarCollapse();
  const asideRef = useRef<HTMLElement>(null);
  const scope = zones[1]?.key;
  const lastScope = useRef(scope);
  /** 문서에서 마지막으로 누르거나 포커스한 컨트롤의 사이드바 구역(밖이면 `null`) — 착지 판정 한 번에 소비된다. */
  const pressedZone = useRef<string | null>(null);
  useEffect(() => {
    const note = (event: Event) => {
      pressedZone.current = event.target instanceof Element ? event.target.closest<HTMLElement>("nav[data-sidebar-zone]")?.dataset.sidebarZone ?? null : null;
    };
    document.addEventListener("pointerdown", note, true);
    document.addEventListener("focusin", note, true);
    return () => {
      document.removeEventListener("pointerdown", note, true);
      document.removeEventListener("focusin", note, true);
    };
  }, []);
  /**
   * ⚠️ **누른 컨트롤이 사라졌을 때만 포커스를 새 구역에 앉힌다** (2026-10-09 sidebar-projects · orch D10 — DESIGN "누른 컨트롤이 사라질 때만").
   * 목록 구역의 프로젝트 행을 누르면 구역이 `projects` → `project`로 바뀌어 `<nav key>`가 다시 마운트되고 누른 링크가 사라진다 — 브라우저는
   * 포커스를 `body`로 떨어뜨린다(POSTMORTEM 2026-09-24 부류). 그때만 새 구역의 현재 항목(`aria-current` — 프로젝트 Home · `/projects/new`의
   * `New project`)으로 옮긴다. "첫 링크" 폴백은 두지 않는다 — 폴백이 필요한 실제 경로가 없고, 있으면 엉뚱한 행으로 튄다.
   * ⚠️ **본문·사용자 구역·헤더·뒤로가기에서 시작한 전이는 옮기지 않는다** — `focusLost()`만 보면 Safari·macOS Firefox 마우스 클릭(포커스를 주지
   * 않는다)이나 본문 링크 언마운트에서도 참이라 사이드바가 남의 포커스를 가져갔다(리뷰 🔴1). 그래서 "누른 것"을 **document**의 `pointerdown`·`focusin`
   * capture로 기록한다(`pointerdown`인 이유는 `dialog.tsx`의 기록과 같다 — 그 브라우저들에선 focus가 안 온다). ⚠️ **aside가 아니라 document다**
   * (리뷰 A2 🟡1) — aside에서만 들으면 목록 행을 누르고 이동 없이 끝난 기록(새 탭 열기·키보드로 들렀다 나감)을 사이드바 밖의 다음 상호작용이
   * 덮지 못해, 본문 링크로 시작한 이동을 사이드바가 가져갔다. 밖의 상호작용은 기록을 `null`로 덮는다.
   * ⚠️ **헤더에서 연 New project 모달을 닫는 커밋도 구역이 바뀐다**(`router.back()` = 슬롯이 비는 커밋 = pathname 복귀). 여기서 착지하면
   * Dialog의 포커스 기록에 Home이 최신으로 들어가 Radix 복귀가 연 자리 대신 Home으로 갔다 — 누른 것이 사이드바 밖이라 비켜서야 복귀가 헤더로 간다.
   * layout 단계인 것은 누른 링크가 착지와 **같은 커밋에서** 사라지기 때문이다(`useLandAfterCommit`과 같은 근거 — 칠해진 프레임에 `body`가 남지 않게).
   */
  useLayoutEffect(() => {
    const previous = lastScope.current;
    if (previous === scope) return;
    lastScope.current = scope;
    const pressed = pressedZone.current;
    pressedZone.current = null;
    if (pressed === null || pressed !== previous) return;
    landFocus(asideRef.current?.querySelector<HTMLElement>(`nav[data-sidebar-zone="${scope}"] [aria-current="page"]`));
    // 착지가 낸 focus(`focusin`)는 "누른 것"이 아니다 — 남기면 아무것도 누르지 않은 다음 전이(뒤로가기 등)가 사이드바에서 누른 것으로 읽힌다.
    pressedZone.current = null;
  }, [scope]);

  return (
    <aside
      ref={asideRef}
      // 자기 안에서 스크롤한다 — 항목이 늘어도 문서를 밀지 않는다 (malmoi#13).
      //
      // ⚠️ **폭이 여기 없다.** 옛 `w-60 shrink-0` 자리는 `components/shell/shell-panels.tsx`의
      // `Panel`이 든다(200~320, 기본 240) — 폭이 두 곳에 있으면 드래그가 고정 폭에 덮인다.
      //
      // ⚠️ **`overflow-x-hidden`이 접힘을 만든다** — 패널이 40으로 좁아지면 라벨·배지가 여기서 잘린다.
      data-collapsed={collapsed ? "" : undefined}
      className="flex h-full flex-col gap-2 overflow-x-hidden overflow-y-auto p-1"
    >
      {/*
        **구역 둘** (PRODUCT §7.7). ⚠️ **라벨이 이름 그대로다** — 사용자 축은 사용자 이름, 프로젝트 축은
        프로젝트 이름(8-3, 시안). 6b-4의 `Your work` 라벨을 대체했다.
        ⚠️ **둘째 자리가 두 형이다** (2026-10-09 사용자, sidebar-projects) — 지금 프로젝트가 있으면 그 프로젝트 구역(머리·스위처·항목),
        없으면 **머리 없는 내 프로젝트 목록 구역**(`aria-label` `Your projects` — 아바타 메뉴와 같은 앞 5 + 끝 행 `New project`)이다.
        머리 없음이 "지금 프로젝트 아님"의 표시다. `New project`는 9-30에 사용자 축에서 빠진 뒤 이 구역의 끝 행으로 LNB에 돌아왔다.
        구역이 바뀌면 다시 마운트되므로, 누른 것이 옛 둘째 구역 안이었으면 위 effect가 포커스를 새 구역의 현재 항목에 앉힌다.
        ⚠️ **2026-09-27에 8-3의 두 결정이 뒤집혔다** (사용자): 사용자 축에 `New project`가 돌아왔고(`navWorkItems` — 2026-09-30에
        헤더 버튼으로 다시 빠졌다), 프로젝트 머리에 **전환 메뉴**(`ProjectSwitcher`)가 섰다 — 8-3은 스위처를 지워 "옮기는 길을 목록 하나로" 모았었다.
        ⚠️ **사용자 구역엔 머리 줄이 없다** (2026-09-30 사용자) — 아바타·이름은 헤더 사용자 메뉴가 이미 든다. `aria-label`(사용자 이름)은
        남긴다 — landmark 둘을 가르는 접근 이름이라서다.
      */}
      {zones.map((zone, index) => (
        <nav
          key={zone.key}
          data-sidebar-zone={zone.key}
          // ⚠️ **구역 라벨이 `<p>`라 접근성 트리에서 이름이 아니다** — 그러면 landmark 둘이 구별되지
          // 않아 "구역을 이름으로 말한다"가 스크린리더 사용자에게만 성립하지 않는다.
          aria-label={zone.label}
          className={cn("flex flex-col gap-0.5", index === 0 ? undefined : "border-border border-t pt-2")}
        >
          {/*
            ⚠️ **라벨 앞에 프로젝트의 얼굴이 선다** (2026-09-24 사용자) — `ProjectThumbnail`(라운드 사각). 사용자 구역의 `Avatar`(원) 머리는
            2026-09-30에 빠졌다.
            ⚠️ **얼굴이 아래 항목 아이콘과 같은 규격이다** (2026-09-25 사용자 — 24 · `px-0.5 py-1`에서) —
            16 · `p-1.5` · `gap-2`가 `Item`과 같아서 머리 라벨과 항목 라벨의 시작점이 한 세로선에 선다.
            줄 높이도 항목과 같은 32다. 중심만 맞추던 옛 판정은 라벨 시작점이 4px 어긋났다.
          */}
          {/*
            ⚠️ **접히면 구역 머리(프로젝트 이름 줄)가 사라진다** (2026-09-28 사용자) — 구역 사이의 수평선은 남는다.
            높이를 grid 행으로 접어 아래 항목이 튀지 않고 올라온다. `inert`가 접힌 머리의 전환 메뉴를 Tab 순서에서 뺀다.
          */}
          {zone.key === "project" && (
          <div inert={collapsed} className={fold(collapsed)}>
          {/* ⚠️ 행을 접는 것은 이 겹이다 — `h-8`을 든 `<p>`에 `overflow-hidden`을 걸면 제 높이 32를 지켜 0fr 행 밖으로 넘친다. */}
          <div className="min-h-0 overflow-hidden">
          <p data-zone-head className={cn(ROW, "text-foreground font-medium")}>
            <ProjectThumbnail name={zone.label} src={project?.image} size="xs" />
            <span className="min-w-0 truncate">{zone.label}</span>
            {/*
              ⚠️ **전환 메뉴는 프로젝트 머리의 오른쪽 끝이다** (2026-09-27 사용자 — 8-3이 지운 스위처가 메뉴 트리거로 돌아왔다).
              목록은 이미 받은 멤버십이다 — 조회를 더하지 않는다.
            */}
            <ProjectSwitcher projects={memberships} current={project?.slug ?? null} />
          </p>
          </div>
          </div>
          )}
          {/*
            ⚠️ **접힌 레일에서는 머리 줄 대신 썸네일 아이콘 버튼이 선다** (2026-10-04 사용자) — 접기 토글과 같은 틀(`ICON_BUTTON`)이고
            누르면 머리와 같은 전환 메뉴가 열린다. 머리와 반대 방향으로 같은 32를 접고 펴서 전이 중에도 아래 항목이 제자리다.
            보이는 이름이 없어 `title`이 프로젝트 이름을, `aria-label`이 동작을 댄다.
          */}
          {zone.key === "project" && (
          <div inert={!collapsed} className={fold(!collapsed)}>
          <div data-zone-rail className="min-h-0 overflow-hidden">
            <ProjectSwitcher
              projects={memberships}
              current={project?.slug ?? null}
              trigger={
                <Button variant="ghost" aria-label={m.common.nav.projectSwitcher.label} title={zone.label} className={ICON_BUTTON}>
                  <ProjectThumbnail name={zone.label} src={project?.image} size="xs" />
                </Button>
              }
            />
          </div>
          </div>
          )}
          {zone.items.map((item) => (
            <Item key={item.key} item={item} active={isActive(pathname, item)} collapsed={collapsed} />
          ))}
        </nav>
      ))}

      {/*
        하단 전역 — 프로젝트·사용자 축이 아니라 공개 셸 페이지라 구역 밖이다. Changelog(`/changelog`) · Docs(`/docs`) 둘이고 같은 탭에서 연다.
        ⚠️ **Sign out이 없다** (2026-09-27 사용자) — 로그아웃은 헤더 사용자 메뉴 하나에만 있다.
      */}
      <div data-sidebar-zone="footer" className="mt-auto flex flex-col gap-0.5 pt-2">
        {navFooterItems(m).map((item) => (
          <Item key={item.key} item={item} active={isActive(pathname, item)} collapsed={collapsed} />
        ))}
        {/* ⚠️ **LNB 맨 아래다** (2026-09-28 사용자). 리사이저로도 접고 편다 — 하한(200) 밑으로 끌면 접히고, 접힌 채 끌면 펴진다(`collapsible`). */}
        <Button
          variant="ghost"
          onClick={toggle}
          aria-expanded={!collapsed}
          title={collapsed ? m.common.nav.expandSidebar : undefined}
          className={ICON_BUTTON}
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          </span>
          <span className={cn("min-w-0 truncate", FADE, collapsed && "opacity-0")}>
            {collapsed ? m.common.nav.expandSidebar : m.common.nav.collapseSidebar}
          </span>
        </Button>
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
function Item({ item, active, collapsed = false }: { item: NavItem; active: boolean; collapsed?: boolean }) {
  const m = useMessages();
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      // 접힌 레일엔 라벨이 안 보인다 — 툴팁 프리미티브가 없어(위 머리 주석) 브라우저 `title`이 이름을 보인다.
      title={collapsed ? item.label : undefined}
      className={cn(
        ROW,
        "text-foreground",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        /**
         * ⚠️ hover와 선택이 **같은 알파면** 포인터 아래의 항목이 선택된 것처럼 보인다 — 한 단계 벌린다.
         *
         * ⚠️ **둘 다 한 단계 내렸다** (2026-09-11 사용자 — `/10`·`/5`에서). 사이드바는 배경도
         * border도 없이 **캔버스 위에 얹혀** 있어서(§6.5), 같은 알파라도 흰 패널 위보다 진하게
         * 보인다. `[0.03]`은 프로젝트 목록 행의 hover와 같은 값이라 임의값이 늘지 않는다.
         */
        active ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.03]",
        /**
         * ⚠️ **누른 항목은 응답 전에 선택 면을 든다** (audit-ux #6 · DESIGN §6.4 `Button loading`). `active`는 커밋 뒤의
         * `usePathname`이라 느린 이동 동안 옛 항목에 남는다. `useLinkStatus`는 **링크의 자손에서만** 값을 내므로
         * 자손이 표식을 내고 링크가 `has-[…]`로 읽는다 — 면을 자손으로 옮기면 hit 영역과 치수가 움직인다.
         * ⚠️ **hover와 겹친 변형이 짝이다** — 누른 직후 커서는 그 항목 위이고, `:hover`와 `:has(…)`는 명시도가 같아
         * 뒤에 나오는 hover 면(0.03)이 이길 수 있다. 둘을 겹치면 명시도로 이긴다.
         */
        "has-[[data-nav-pending]]:bg-foreground/[0.07] hover:has-[[data-nav-pending]]:bg-foreground/[0.07]",
      )}
    >
      <PendingMark />
      {/*
        프로젝트 밖 목록 구역의 프로젝트 행은 아이콘 자리에 그 프로젝트의 얼굴(16)이 선다(sidebar-projects) — 구역 머리 썸네일과 같은
        규격이라 라벨 시작점이 다른 항목과 한 세로선이다. 이름 글자가 옆에 있어 타일은 장식이다.
      */}
      <span className="flex size-4 shrink-0 items-center justify-center">
        {item.thumbnail ? <ProjectThumbnail name={item.label} src={item.thumbnail.src} size="xs" /> : <Icon className="size-4" aria-hidden />}
      </span>
      {/*
        ⚠️ **선택에 굵기를 주지 않는다** (2026-09-20 사용자 — 옛 판정 "선택의 굵기가 라벨에만 붙는다"의
        철회). 선택 상태는 **면(배경 알파) 하나로만** 표현한다 — 굵기가 함께 움직이면 라벨 폭이 바뀌어
        선택을 옮길 때마다 글자가 미세하게 흔들리고, 신호가 둘이라 면의 대비를 조정할 근거도 흐려진다.
      */}
      <span className={cn("min-w-0 truncate", FADE, collapsed && "opacity-0")}>{item.label}</span>
      {/*
        ⚠️ **개수는 0이면 서지 않는다** (2026-10-01 ux-drift-unify Q13 — 옛 규칙 "0도 보인다"의 철회). 같은 개수가 카드 머리에서는
        0에 사라지고 여기서만 `0`으로 서서 한 화면 안에서 규칙이 둘이었다. 문자열 배지(버전)는 개수가 아니라 그대로다.
      */}
      {item.key === "inbox" ? (
        <InboxCount className={cn("ml-auto shrink-0", FADE, collapsed && "opacity-0")} />
      ) : typeof item.badge === "number" ? (
        <CountBadge
          count={item.badge}
          label={navCountLabel(m, item.key)?.(item.badge) ?? String(item.badge)}
          className={cn("ml-auto shrink-0", FADE, collapsed && "opacity-0")}
        />
      ) : item.badge !== undefined && (
        <Badge variant="soft-neutral" className={cn("ml-auto shrink-0", FADE, collapsed && "opacity-0")}>
          {item.badge}
        </Badge>
      )}
    </Link>
  );
}

/**
 * Inbox 항목의 배지 — **서버 값이 아니라 헤더 `AttentionInbox`가 쓰는 탭 안 store 값이다**(inbox-page D2). 배지 수를 따로 조회하지 않는다.
 * 훅을 항목마다 조건부로 부르지 않도록 자식 하나로 뗐다. 서버 렌더 스냅샷은 0이라 배지 없이 그리고, 하이드레이션 뒤 헤더 응답이 오면 선다.
 * 헤더는 `9+`로 접지만 여기는 다른 사이드바 배지처럼 실제 수다.
 */
function InboxCount({ className }: { className: string }) {
  const m = useMessages();
  const unread = useInboxUnread();
  return <CountBadge count={unread} label={navCountLabel(m, "inbox")?.(unread) ?? String(unread)} className={className} />;
}

/** 이 링크의 이동이 진행 중이면 보이지 않는 표식 하나 — 면은 링크가 그린다(`Item`). */
function PendingMark() {
  const { pending } = useLinkStatus();
  return pending ? <span data-nav-pending hidden /> : null;
}
