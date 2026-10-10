"use client";

import { ChevronsUpDown, List } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { LargeModal } from "@/components/ui/large-modal";
import { WIDE_QUERY } from "@/lib/shell/breakpoint";

/**
 * 하단 캡슐 — 헤더 검색 캡슐(`FieldButton`)의 짝이다: 44 · radius full · 연한 윤곽 · 바탕 면 · hover·포커스는 흰 테두리 버튼 그대로(`Button` default).
 * 본문 위에 떠서 그림자만 한 단계 높고(`shadow-medium`), 폭은 라벨을 따른다(PT2a). 좌우 16/14 · List 16 + 제목 14/500(말줄임) + ChevronsUpDown 14 muted.
 */
const CAPSULE = "pointer-events-auto h-11 max-w-full rounded-full border-border-subtle shadow-medium pr-3.5 pl-4";

/**
 * **좁은 폭(`lg` 미만)의 장 내비 — 하단 캡슐 + 전체 화면 시트** (responsive-public PT2a·PT2c · D1·D7·D14). 헤더 메뉴는 늘 글로벌 서랍이고
 * 장 내비는 이 캡슐만 연다. 시트는 R1의 `LargeModal` `lg` 미만 형(`flush`)이다 — 새 시트 프리미티브를 만들지 않는다.
 *
 * ⚠️ **캡슐 라벨 = 현재 페이지 제목, 없으면(404) Docs 제목**(D7) — 현재 판정은 `DocsNavLink`와 같은 정확 일치다. 레이아웃이 하위 params를
 * 못 받아 경로를 클라이언트에서 읽는다.
 * ⚠️ **열면 현재 행에 포커스**(`initialFocusRef` — effect로 옮기면 Radix의 열림 자동 포커스에 진다). 포커스가 그 행을 보이게 스크롤한다.
 * ⚠️ **링크로 닫히면 캡슐로 돌려주지 않는다** — 도착한 페이지의 본문 스크롤러가 재마운트되어 포커스를 받는다(§6.615). 지금 페이지 행은
 * 이동이 없어 재마운트도 없으므로 캡슐로 돌아간다.
 * ⚠️ **열린 동안만 `lg` 리스너를 단다** — 넓어지면 닫고 고정 내비의 현재 행(없으면 본문 스크롤러)으로 보낸다. 캡슐은 그때 `lg:hidden`이라
 * 거기로 돌려주면 `body`로 빠진다(POSTMORTEM 2026-09-24).
 */
export function DocsNavSheet({ pages, label, title, closeLabel, children }: {
  /** SUMMARY의 모든 행(경로 · 제목) — 캡슐 라벨을 찾는다. */
  pages: readonly { href: string; title: string }[];
  /** 캡슐의 접근 이름 · 시트 머리 제목 · 시트 nav 이름(`m.publicDocs.docs.nav`). */
  label: string;
  /** 현재 페이지가 없을 때의 캡슐 라벨(`m.publicDocs.docs.title`). */
  title: string;
  closeLabel: string;
  /** 고정 내비와 같은 트리(`DocsNavTree`) — 서버가 그려 넘긴다. */
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const capsule = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const currentRow = useRef<HTMLElement | null>(null);
  const current = pages.find((page) => page.href === pathname)?.title ?? title;

  useEffect(() => {
    if (!open) return;
    // ⚠️ jsdom에는 `matchMedia`가 없다 — 없는 환경은 폭이 바뀌지 않는 것으로 읽는다.
    const query = window.matchMedia?.(WIDE_QUERY);
    if (query == null) return;
    const onChange = (event: { matches: boolean }) => {
      if (!event.matches) return;
      returnTo.current = document.querySelector<HTMLElement>('[data-docs-nav] [aria-current="page"]') ?? document.querySelector<HTMLElement>("[data-public-scroller]");
      setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open]);

  const onNavigate = (event: MouseEvent<HTMLElement>) => {
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (link === null) return;
    // 지금 페이지 행은 이동이 없다 — 캡슐로 돌아간다.
    returnTo.current = link.getAttribute("aria-current") === "page" ? capsule.current : null;
    setOpen(false);
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-6 lg:hidden">
        <Button ref={capsule} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} className={CAPSULE}
          onClick={() => { returnTo.current = capsule.current; setOpen(true); }}>
          <List aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{current}</span>
          <ChevronsUpDown aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
        </Button>
      </div>
      <LargeModal open={open} flush title={label} closeLabel={closeLabel} actions={null} onClose={() => setOpen(false)}
        returnFocusRef={returnTo} initialFocusRef={currentRow}>
        {/* 행 최소 40 — 전체 화면이라 서랍 행과 같은 높이다. 위 ref 콜백은 커밋 때 돌아 Radix의 열림 포커스보다 먼저 현재 행을 잡는다. */}
        <nav aria-label={label} onClick={onNavigate} className="p-3 [&_a]:min-h-10 [&_a]:py-2"
          ref={(node) => { currentRow.current = node?.querySelector<HTMLElement>('[aria-current="page"]') ?? null; }}>
          {children}
        </nav>
      </LargeModal>
    </>
  );
}
