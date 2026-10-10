"use client";

import { ArrowUpRight, CircleHelp, Compass, Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";

import { ThemeSwitcher } from "@/components/color-scheme/theme-switcher";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { useMessages } from "@/components/i18n/messages-provider";
import { GithubIcon } from "@/components/signin/brand-icons";
import { Button, TOUCH_TARGET } from "@/components/ui/button";
import { Dialog, DrawerContent } from "@/components/ui/dialog";
import { MalmoiMark } from "@/components/ui/malmoi-mark";
import { GITHUB_REPO_URL } from "@/lib/links";
import { routes } from "@/lib/routes";
import { WIDE_QUERY } from "@/lib/shell/breakpoint";
import { cn } from "@/lib/utils";

export type HeaderCurrent = "docs" | "changelog";

/** 메뉴 버튼 표식(`data-public-nav-menu`) — 좁아지며 숨는 링크(`WideOnly`)가 포커스를 넘길 자리다. 헤더에 하나다. */
const MENU = "[data-public-nav-menu]";

/**
 * 서랍 행 — 40 · px 10 · radius 8 · 14/500 · 아이콘 16(PT1b). 헤더처럼 선택 면을 그리지 않는다(`aria-current`만). 긴 번역은 줄바꿈한다(PT8a —
 * 말줄임 없이 높이가 는다). 터치에서는 `Button`과 같은 `::after`로 44까지 넓힌다(보이는 크기는 그대로).
 */
const ROW = cn(
  "text-foreground flex min-h-10 items-center gap-2 rounded-sm px-2.5 py-2 text-sm font-medium hover:bg-foreground/[0.03]",
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none [&>svg]:size-4 [&>svg]:shrink-0",
  TOUCH_TARGET,
);

/**
 * **`lg` 미만 헤더의 메뉴 버튼 + 측면 서랍** (responsive-public PT1b · design §2). 헤더 메뉴는 어느 페이지에서나 이 글로벌 서랍만 연다.
 *
 * ⚠️ **검색·Inbox·계정은 서랍에 넣지 않는다** — 헤더에 한 벌이다(검색은 인스턴스마다 ⌘K 리스너, Inbox는 마운트마다 배지 Action). 서랍은 링크 셋과
 * 언어·테마 스위처만 든다. 계정과 무관하다(PT1c).
 * ⚠️ **열린 동안만 `lg` 리스너를 단다** — 넓어지면 닫고 고정 내비의 대응 링크(서랍에서 포커스가 있던 행과 같은 목적지 → 지금 페이지 링크 → 본문)로
 * 포커스를 옮긴다. 메뉴 버튼은 그때 `lg:hidden`이라 Radix 기본 복귀로 두면 `body`로 빠진다(POSTMORTEM 2026-09-24).
 * ⚠️ **링크로 닫히면 메뉴 버튼으로 돌려주지 않는다** — 도착한 페이지(스크롤러 재마운트)가 포커스를 가진다. `/docs`는 레이아웃이 셸을 들어 서랍이
 * 이동 뒤에도 마운트돼 있으므로 닫기를 링크가 직접 한다.
 */
export function NavDrawer({ current }: { current?: HeaderCurrent }) {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  // 닫힘 뒤 포커스를 정할 자리 — `"link"`면 도착한 페이지, 요소면 넓어진 헤더의 그 자리, `null`이면 메뉴 버튼.
  const landing = useRef<"link" | HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // ⚠️ jsdom에는 `matchMedia`가 없다 — 없는 환경은 폭이 바뀌지 않는 것으로 읽는다.
    const query = window.matchMedia?.(WIDE_QUERY);
    if (query == null) return;
    const onChange = (event: { matches: boolean }) => {
      if (!event.matches) return;
      landing.current = wideTarget(menu.current, document.activeElement);
      setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open]);

  const close = (by: "link" | null) => () => { landing.current = by; setOpen(false); };

  return (
    <>
      {/* 열림 면은 Inbox 트리거와 같은 3%다(PT1b). 글리프는 늘 foreground(ghost 기본 muted를 덮는다 — 헤더 Inbox와 같은 이탈). */}
      <Button ref={menu} size="icon-md" variant="ghost" data-public-nav-menu="" aria-label={m.landing.shell.openNav} aria-haspopup="dialog" aria-expanded={open}
        className="text-foreground hover:bg-foreground/[0.03] aria-expanded:bg-foreground/[0.03] lg:hidden" onClick={() => setOpen(true)}>
        <Menu className="size-4" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DrawerContent
          title={m.landing.shell.nav}
          start={
            <Link href={routes.home()} aria-label={m.landing.shell.logo} onClick={close("link")}
              className="focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none">
              <MalmoiMark size={32} />
            </Link>
          }
          actions={<><LocaleSwitcher /><ThemeSwitcher /></>}
          onCloseAutoFocus={(event) => {
            const target = landing.current;
            landing.current = null;
            event.preventDefault();
            if (target === "link") return;
            // ⚠️ **기본 복귀를 메뉴 버튼으로 명시한다**(#213) — 트리거 없이 연 Dialog라 복귀가 "최근 포커스 기록"이었고, 브라우저는 서랍을 떼는 순간
            // `focusout`을 쏴 셸 스크롤러가 포커스를 되찾아(`scroller.tsx`) 그 기록의 맨 끝이 스크롤러였다. jsdom은 그 `focusout`을 안 쏴 green이었다.
            (target ?? menu.current)?.focus();
          }}
        >
          <nav aria-label={m.landing.shell.nav} className="flex flex-col gap-0.5">
            <Link href={routes.docs()} aria-current={current === "docs" ? "page" : undefined} className={ROW} onClick={close("link")}>
              <CircleHelp aria-hidden />
              <span className="min-w-0 flex-1">{m.landing.shell.docs}</span>
            </Link>
            <Link href={routes.changelog()} aria-current={current === "changelog" ? "page" : undefined} className={ROW} onClick={close("link")}>
              <Compass aria-hidden />
              <span className="min-w-0 flex-1">{m.changelog.title}</span>
            </Link>
            {/* 외부 링크 — 새 탭 + `noreferrer`(공개 셸의 외부 링크 규칙). 이 페이지는 그대로라 닫으면 메뉴 버튼으로 돌아간다. */}
            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className={ROW} onClick={close(null)}>
              <GithubIcon aria-hidden />
              <span className="min-w-0 flex-1">{m.landing.shell.github}</span>
              <span className="text-gray-dim flex"><ArrowUpRight aria-hidden className="size-3.5" /></span>
            </a>
          </nav>
        </DrawerContent>
      </Dialog>
    </>
  );
}

/**
 * 넓어진 헤더에서 포커스를 받을 자리 — 서랍에서 포커스가 있던 링크와 같은 목적지의 헤더 링크, 없으면 지금 페이지 링크, 없으면 본문이다(design §2).
 * 본문 제목은 대개 포커스를 못 받으므로(`tabindex` 없음) 그 제목을 든 스크롤러로 간다 — 키보드 스크롤이 거기서 이어진다.
 */
function wideTarget(menu: HTMLElement | null, active: Element | null): HTMLElement | null {
  const header = menu?.closest("header");
  if (header == null) return null;
  const href = active instanceof HTMLAnchorElement ? active.getAttribute("href") : null;
  const links = [...header.querySelectorAll<HTMLAnchorElement>("a[href]")];
  return links.find((link) => href !== null && link.getAttribute("href") === href)
    ?? header.querySelector<HTMLElement>('[aria-current="page"]')
    ?? document.querySelector<HTMLElement>("main h1[tabindex]")
    ?? document.querySelector<HTMLElement>("[data-public-scroller]");
}

/**
 * **`lg` 이상에서만 보이는 묶음**(헤더 내비 · GitHub · 공개 푸터 스위처) — 좁아지며 숨을 때 그 안에 포커스가 있었으면 메뉴 버튼으로 옮긴다
 * (design §2 — `body`로 빠지면 Tab이 문서 첫머리에서 다시 시작한다). 리스너는 **포커스가 안에 있는(또는 안의 트리거가 연 메뉴에 있는) 동안만** 단다.
 * 숨김은 CSS(`max-lg:hidden`)가 하고, 이 묶음은 그 순간의 포커스만 든다.
 *
 * ⚠️ **두 순서를 다 받는다**(#214) — 브라우저는 MQL `change`보다 먼저 스타일을 다시 계산해 숨은 링크에서 `blur`(relatedTarget 없음)를 쏠 수 있다.
 * 그때 묶음이 이미 `display: none`이면 숨겨져서 잃은 것이라 그 자리에서 넘긴다. 숨지 않았는데 relatedTarget이 없으면(빈 곳 클릭) 셸 스크롤러의 몫이다.
 * ⚠️ **안의 트리거가 연 포털 메뉴(푸터 스위처)도 묶음 안이다** — 메뉴가 열린 채 좁아지면 숨은 트리거에 붙어 남는다. Esc로 닫고, Radix가 (숨은)
 * 트리거로 돌려주는 복귀가 지난 뒤에 메뉴 버튼으로 옮긴다.
 */
export function WideOnly({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const stop = useRef<(() => void) | null>(null);
  // 안의 트리거가 연 포털 메뉴 — 포커스가 거기 있는 동안도 묶음 안으로 친다.
  const portal = useRef<HTMLElement | null>(null);
  useEffect(() => () => stop.current?.(), []);

  function handOff() {
    stop.current?.();
    document.querySelector<HTMLElement>(MENU)?.focus();
  }

  // ⚠️ React는 포털의 focus 이벤트도 컴포넌트 트리로 올려 보낸다 — 메뉴 항목의 focus가 여기로 온다. DOM으로 안이면 묶음 자체, 밖이면 그 메뉴다.
  function watch(event: FocusEvent) {
    const target = event.target;
    portal.current = ref.current?.contains(target) ? null : target.closest<HTMLElement>('[role="menu"]');
    if (stop.current !== null) return;
    const query = window.matchMedia?.(WIDE_QUERY);
    if (query == null) return;
    const onChange = (event: { matches: boolean }) => {
      if (event.matches) return;
      const menu = portal.current;
      if (menu?.isConnected) {
        stop.current?.();
        menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        // Radix는 메뉴가 떨어진 뒤 `setTimeout(0)`에 트리거로 돌려준다 — 떨어진 것을 본 다음 틱에 넘겨 그 복귀 뒤에 선다.
        let tries = 0;
        const after = () => {
          if (menu.isConnected && ++tries < 20) { window.setTimeout(after, 0); return; }
          window.setTimeout(() => document.querySelector<HTMLElement>(MENU)?.focus(), 0);
        };
        window.setTimeout(after, 0);
        return;
      }
      if (ref.current?.contains(document.activeElement)) handOff();
    };
    query.addEventListener("change", onChange);
    stop.current = () => { query.removeEventListener("change", onChange); stop.current = null; portal.current = null; };
  }

  function onBlur(event: FocusEvent) {
    const next = event.relatedTarget;
    if (next instanceof Node && (ref.current?.contains(next) || portal.current?.contains(next))) return;
    const menu = next instanceof Element ? next.closest<HTMLElement>('[role="menu"]') : null;
    const opener = menu?.getAttribute("aria-labelledby");
    if (menu != null && opener != null && ref.current?.contains(document.getElementById(opener))) { portal.current = menu; return; }
    if (next === null && ref.current !== null && getComputedStyle(ref.current).display === "none") { handOff(); return; }
    stop.current?.();
  }

  return (
    <div ref={ref} className={className} onFocus={watch} onBlur={onBlur}>
      {children}
    </div>
  );
}
