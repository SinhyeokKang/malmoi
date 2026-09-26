"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 문서 내비의 행 하나 — **현재 페이지 = 면**(`--muted` · 500 · `aria-current="page"`, 시안 `Docs.dc.html` 1b).
 *
 * ⚠️ **현재 판정이 여기 있는 이유**: 내비는 `app/docs/layout.tsx`가 들고, 레이아웃은 하위 세그먼트의 params를 받지 못한다.
 * 그래서 경로를 클라이언트에서 읽는다 — 404(1d)는 어느 행과도 같지 않아 "현재 표시 없음"이 저절로 선다.
 * ⚠️ **정확히 일치만 현재다** — 접두로 켜면 `/docs`(개요)가 모든 페이지에서 켜진다.
 */
export function DocsNavLink({ href, chapter, children }: { href: string; chapter: boolean; children: ReactNode }) {
  const current = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring flex min-h-8 items-center rounded-sm py-1.5 pr-2 text-sm focus-visible:ring-2 focus-visible:outline-none",
        chapter ? "pl-2 font-medium" : "text-muted-foreground pl-7",
        // hover는 글자색만 — 면은 현재 페이지의 표시다(시안 1b).
        current ? "bg-muted text-foreground font-medium" : "hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
