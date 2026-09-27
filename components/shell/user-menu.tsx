"use client";

import { Box, CircleHelp, CircleUser, Loader2, LogOut, ScrollText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useFormStatus } from "react-dom";

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
import { m } from "@/lib/i18n";
import { GITHUB_RELEASES_URL } from "@/lib/links";
import { routes } from "@/lib/routes";

/**
 * top bar 우측. **항목이 여섯이고 순서가 사용자 결정이다** (2026-09-27):
 * `Projects · Account | Release notes · Docs · Privacy Policy | Sign out`. LNB와 겹치는 항목(Projects·Account·
 * Release notes·Docs)은 의도다. **모든 줄이 필터 메뉴와 같은 `DropdownMenuItem` 모양이고 앞 아이콘 하나를 든다** —
 * 아이콘은 같은 목적지를 가리키는 다른 자리와 같은 글리프다(Projects `Box` · Account `CircleUser` · Docs `CircleHelp`는
 * LNB, Release notes `ScrollText`는 LNB 하단과 공유). Release notes만 외부(GitHub Releases, 새 탭)이고 외부 링크 글리프를
 * 달지 않는다(DESIGN §6.3).
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
}: {
  name: string;
  email: string | null;
  image: string | null;
  signOut: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
          ⚠️ **버튼이 아바타와 같은 32px여야 한다** (8-2 실측). `size="sm"`은 `h-7`(28)이라 32 아바타가
          위아래로 2px씩 삐져나왔고, 시안의 헤더는 딱 32 정사각이다.
        */}
        <Button variant="ghost" aria-label={m.common.nav.userMenu} className="size-8 rounded-full p-0">
          <Avatar name={name} src={image} size={32} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="text-foreground block text-sm font-medium">{name}</span>
          {email !== null && <span className="block">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <MenuLink href={routes.projects()} icon={Box} label={m.common.nav.projects} />
        <MenuLink href={routes.account()} icon={CircleUser} label={m.common.nav.account} />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={GITHUB_RELEASES_URL} target="_blank" rel="noreferrer">
            <ScrollText className="size-4" aria-hidden />
            {m.common.nav.releaseNotes}
          </a>
        </DropdownMenuItem>
        <MenuLink href={routes.docs()} icon={CircleHelp} label={m.publicDocs.docs.title} />
        <MenuLink href={routes.privacy()} icon={ShieldCheck} label={m.publicDocs.privacy.title} />
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

function MenuLink({ href, icon: Icon, label }: { href: string; icon: typeof Box; label: string }) {
  return (
    <DropdownMenuItem asChild>
      <Link href={href}>
        <Icon className="size-4" aria-hidden />
        {label}
      </Link>
    </DropdownMenuItem>
  );
}
