"use client";

import { LogOut } from "lucide-react";

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

/**
 * top bar 우측. **6a는 로그아웃 하나다** — Account 항목은 6b가 `/account`를 만들지 말지 정한 뒤에 붙는다.
 *
 * ⚠️ **아바타 이미지를 싣지 않는다** — `SessionRead`가 `name`·`email`만 든다. GitHub 아바타를 넣으려면
 * `publicSession`이 필드를 하나 더 실어야 하고, 그건 모든 요청의 세션 페이로드를 넓히는 결정이다.
 * 이니셜 폴백으로 충분하다.
 *
 * ⚠️ 이메일을 마스킹하지 않는다 — **자기 주소**다. 남의 주소를 보이는 자리(초대 화면·셀 메타)만
 * `maskEmail`을 지난다.
 */
export function UserMenu({
  name,
  email,
  signOut,
}: {
  name: string;
  email: string | null;
  signOut: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={m.common.nav.userMenu} className="px-1">
          <Avatar name={name} size={32} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="text-foreground block text-sm font-medium">{name}</span>
          {email !== null && <span className="block">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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
