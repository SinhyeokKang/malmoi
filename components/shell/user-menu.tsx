"use client";

import { CircleHelp, Compass, Loader2, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import type { SearchMembershipsResult } from "@/app/search/actions";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMessages } from "@/components/i18n/messages-provider";
import { LiveStatus } from "@/components/shell/live-status";
import { ProjectMenuItem, ProjectMenuItemSkeleton } from "@/components/shell/project-menu-item";
import { routes } from "@/lib/routes";
import { activeProject, navWorkItems, type NavItem, type NavProject } from "@/lib/shell/nav";
import { loadSearchMemberships } from "@/lib/search/load-memberships";
import { menuProjects } from "@/lib/shell/switcher";

/**
 * top bar 우측. **순서가 사용자 결정이다** (2026-09-27 — 2026-09-30에 New project가 헤더 버튼으로 빠졌다):
 * `Projects · Inbox · MCP connector · Preferences · Account | 내 프로젝트 ≤5 | Changelog · Docs · Privacy Policy | Sign out`.
 * 첫 묶음은 사이드바 사용자 구역과 **같은 목록**(`navWorkItems`)이고, LNB와 겹치는 항목은 의도다. **모든 줄이 필터 메뉴와 같은
 * `DropdownMenuItem` 모양이고 앞 아이콘 하나를 든다** — 아이콘은 같은 목적지를 가리키는 다른 자리와 같은 글리프다(Projects `Box` ·
 * Account `CircleUser` · Docs `CircleHelp`는 LNB, Changelog `Compass`는 LNB 하단과 공유). 전부 앱 안 목적지다 — Changelog는
 * 2026-09-28에 GitHub Releases 외부 링크에서 `/changelog`로 바뀌었다.
 *
 * ⚠️ **프로젝트 그룹은 LNB 스위처와 겹친다 — 새 결정이다** (2026-10-09 사용자, user-menu-projects). 공개 셸엔 사이드바가 없어
 * 프로젝트로 가는 길이 두 번 이동이었다. 행은 스위처와 같은 조각(`ProjectMenuItem` — 썸네일이 글리프 자리)이고, 목록은 스위처
 * 순서에서 보관을 뺀 앞 5개(`menuProjects`)다. "더 보기"가 없다 — 위 `Projects`가 목록으로 간다. 0개면 그룹·구분선이 없다.
 * ⚠️ **메뉴 폭은 `w-60` 고정이다** — 긴 이름·이메일이 메뉴를 넓히지 않고 줄어든다.
 *
 * ⚠️ **공개 셸은 멤버십을 안 넘긴다 — 메뉴가 열기 직전에 읽는다**(D2). 페이지 렌더에 조회를 싣지 않는다(메뉴를 안 여는 방문이
 * 대부분이다). 회차 규칙은 한 문장이다: ref에 Promise **하나**를 보유하고, 트리거의 hover·focus·열기 중 무엇이 와도 **보유한 것이
 * 없을 때만** 시작하며, **닫힐 때 비운다**. 응답은 `ref.current === 그 Promise`일 때만 그린다 — 닫힌 뒤 응답·이전 회차 응답·A→B
 * 역전(POSTMORTEM 2026-09-13)을 세대 번호 없이 가른다. 로더 계약 "다음 열기에 재사용하지 않는다"는 열기 회차 단위로 지킨다.
 * 실패(`unauthorized`·`unavailable`)는 그룹을 조용히 지운다 — 위 `Projects`가 같은 목적지라 막힌 일이 없다(Inbox·검색과 갈리는 것은 의도).
 * 응답으로 행이 늘면 아래 그룹이 밀린다 — 대가로 수용했고, 열기 직전 읽기가 그 완화책이다.
 *
 * ⚠️ **아바타가 사진을 싣는다** (2026-09-13). 그 전엔 `SessionRead`가 `name`·`email`만 들어
 * 이니셜뿐이었고, **여기 적혀 있던 근거의 뒷문장이 거짓이었다**: *"`publicSession`이 필드를 하나 더
 * 실어야 하고 그건 모든 요청의 세션 페이로드를 넓히는 결정이다."*
 *
 * `lib/auth/public-session.ts`의 허용 목록에는 **`image`가 이미 있었다** — `/api/auth/session` 본문은
 * 전부터 사진 URL을 실었고, 떨어뜨리던 것은 `lib/auth/read-session.ts`의 `SessionRead` 하나였다.
 * **세션 페이로드는 안 커진다.** 남겨 두면 다음 사람이 같은 비용을 다시 계산한다.
 *
 * ⚠️ **셸 32와 `/account` 56이 같은 얼굴이어야 한다** — 한쪽만 사진이면 같은 계정이 두 얼굴이 되고,
 * 아바타 56의 존재 이유(*"셸의 32와 같은 판정·같은 입력"*)가 자기 손으로 깨진다.
 *
 * ⚠️ 이메일을 마스킹하지 않는다 — **자기 주소**다. 남의 주소를 보이는 자리(초대 화면·셀 메타)만
 * `maskEmail`을 지난다.
 */
export function UserMenu({
  name,
  email,
  image,
  signOut,
  memberships,
}: {
  name: string;
  email: string | null;
  image: string | null;
  signOut: () => void;
  /** 앱 셸 헤더가 이미 받은 멤버십 — 지금 프로젝트는 여기서 pathname으로 구한다(헤더는 서버 컴포넌트라 pathname이 없다). */
  memberships?: readonly NavProject[];
}) {
  const m = useMessages();
  const pathname = usePathname();
  const [loaded, setLoaded] = useState<SearchMembershipsResult | null>(null);
  const request = useRef<Promise<SearchMembershipsResult> | null>(null);
  // 닫힐 때 Radix가 포커스를 트리거로 돌려준다 — 그 focus는 열기 직전 신호가 아니다. 안 거르면 닫을 때마다 조회가 하나 샌다.
  const focusReturning = useRef(false);
  useEffect(() => () => { request.current = null; }, []);

  function prefetch() {
    if (memberships !== undefined || request.current !== null) return;
    const pending = loadSearchMemberships();
    request.current = pending;
    void pending.then((result) => { if (request.current === pending) setLoaded(result); });
  }

  const lazy = memberships === undefined;
  const waiting = lazy && loaded === null;
  const projects = menuProjects(memberships ?? (loaded?.ok ? loaded.memberships : []));
  // 지금 프로젝트는 앱 셸(멤버십을 받는 자리)에만 있다 — 공개 셸엔 프로젝트 경로가 없다(`SearchDialog`의 `activeSlug`와 같은 판정).
  // 없으면 `undefined`를 넘긴다 — `false`도 `menuitemradio`가 되므로(`ProjectMenuItem`).
  const current = memberships === undefined ? null : activeProject(pathname, memberships)?.slug ?? null;
  return (
    <DropdownMenu onOpenChange={(open) => {
      if (open) { prefetch(); return; }
      request.current = null;
      setLoaded(null);
    }}>
      <DropdownMenuTrigger asChild>
        {/*
          ⚠️ **버튼이 아바타와 같은 32px여야 한다** (8-2 실측). `size="sm"`은 `h-7`(28)이라 32 아바타가
          위아래로 2px씩 삐져나왔고, 시안의 헤더는 딱 32 정사각이다.
        */}
        {/* 열린 동안 3px 링(`foreground` 3% — 시안 PT5b, #218). Inbox 트리거의 열림 면과 같은 판단이고 원형 아바타라 면 대신 링이다. */}
        <Button size="icon-md" variant="ghost" aria-label={m.common.nav.userMenu} className="rounded-full aria-expanded:ring-3 aria-expanded:ring-foreground/[0.03]"
          onPointerEnter={prefetch}
          onFocus={() => { if (focusReturning.current) focusReturning.current = false; else prefetch(); }}>
          <Avatar name={name} src={image} size={32} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={() => {
        // Radix가 이 핸들러 바로 뒤에 같은 틱에서 트리거를 포커스한다(Escape·고르기·modal의 바깥 좌클릭 닫힘). 우클릭 바깥 닫힘은
        // 포커스를 돌려주지 않는다(`hasInteractedOutside`) — 그때 선 플래그는 마이크로태스크가 풀어 다음 진짜 focus를 삼키지 않는다.
        focusReturning.current = true;
        queueMicrotask(() => { focusReturning.current = false; });
      }}>
        <DropdownMenuLabel>
          <span className="text-foreground block truncate text-sm font-medium">{name}</span>
          {email !== null && <span className="block truncate">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* 첫 묶음은 사이드바 사용자 구역과 같은 목록이다(`navWorkItems`) — 두 벌이면 한쪽에만 항목이 는다. */}
        {navWorkItems(m).map((item) => (
          <MenuLink key={item.key} href={item.href} icon={item.icon} label={item.label} />
        ))}
        {/* 상태 문장은 골격(`aria-busy`) 밖의 region이 든다 — 메뉴 면과 함께 빈 채로 선다(Inbox와 같은 형). */}
        {lazy && <LiveStatus text={waiting ? m.projects.loading : ""} />}
        {/* ⚠️ 그룹은 응답 전후로 같은 Fragment 자리다 — 구분선·아래 항목이 다시 마운트되지 않아 지금 포커스를 잃지 않는다(POSTMORTEM 2026-09-24). */}
        {(waiting || projects.length > 0) && (
          <>
            <DropdownMenuSeparator />
            {waiting ? <ProjectMenuItemSkeleton /> : projects.map((project) => (
              <ProjectMenuItem key={project.slug} project={project} selected={current === null ? undefined : project.slug === current} />
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <MenuLink href={routes.changelog()} icon={Compass} label={m.changelog.title} />
        <MenuLink href={routes.docs()} icon={CircleHelp} label={m.publicDocs.docs.title} />
        <MenuLink href={routes.privacy()} icon={ShieldCheck} label={m.signIn.footer.privacy} />
        <DropdownMenuSeparator />
        {/* 폼이 항목을 감싼다 — 항목이 가장 가까운 폼을 제출한다(`SignOutItem`). */}
        <form action={signOut}>
          <SignOutItem />
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * ⚠️ **제출 중에는 메뉴가 닫히지 않고 disabled + 스피너다** (audit #25) — 기본 동작대로 고르는 순간 닫히면 진행 표시를
 * 세울 자리 자체가 사라진다. 이동이 끝나면 페이지가 바뀌므로 열린 채 남는 일은 없다.
 */
function SignOutItem() {
  const m = useMessages();
  const { pending } = useFormStatus();
  return (
    /*
      ⚠️ **`Button`도 raw `<button>`도 아니다** (2026-09-27 사용자) — ghost `Button`은 h-9·muted 글자·`rounded-md`를 들어 이 줄만
      필터 메뉴 항목과 달랐고, raw `<button>`은 `ui/` 밖 raw 태그 0 게이트(focus-ring.test)에 걸린다. 항목 자체가 감싼 폼을
      `requestSubmit()`으로 제출한다 — 그래야 `action`·`useFormStatus`가 그대로 돌고 Enter·클릭이 같은 길을 지난다.
    */
    <DropdownMenuItem
      disabled={pending}
      aria-busy={pending}
      onSelect={(event) => {
        event.preventDefault();
        (event.currentTarget as HTMLElement).closest("form")?.requestSubmit();
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
      {m.common.nav.signOut}
    </DropdownMenuItem>
  );
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: NavItem["icon"]; label: string }) {
  return (
    <DropdownMenuItem asChild>
      <Link href={href}>
        <Icon className="size-4" aria-hidden />
        {label}
      </Link>
    </DropdownMenuItem>
  );
}
