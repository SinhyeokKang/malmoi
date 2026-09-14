"use client";

import { CircleUser, LogOut } from "lucide-react";
import Link from "next/link";

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
import { routes } from "@/lib/routes";

/**
 * top bar 우측. **항목 둘이다** — 계정과 로그아웃. 앞의 것은 6b-4가 `/account`를 만들면서 붙었다
 * (6a 시점에는 갈 곳이 없어 로그아웃 하나였다).
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
        <DropdownMenuItem asChild>
          <Link href={routes.account()} className="flex w-full items-center gap-2 px-2">
            <CircleUser className="size-4" aria-hidden />
            {m.common.nav.settings}
          </Link>
        </DropdownMenuItem>
        {/* 폼이 항목을 감싼다 — Radix Item은 기본이 `div`라 그 안에 submit을 두어야 한다. */}
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <Button type="submit" variant="ghost" className="w-full justify-start gap-2 px-2">
              <LogOut className="size-4" aria-hidden />
              {m.common.nav.signOut}
            </Button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
