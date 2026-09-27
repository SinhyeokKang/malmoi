import type { ReactNode } from "react";

import type { PublicCta } from "@/lib/auth/landing";

import { PublicFooter } from "./footer";
import { PublicHeader } from "./header";
import { PublicScroller } from "./scroller";

/**
 * 공개 셸(`/` · `/privacy` · `/docs/*`) — 헤더 40 + 8 · 패널 · 푸터 40이 뷰포트 높이를 **정확히** 채운다 (시안 1a · 1e).
 *
 * ⚠️ **route group 레이아웃으로 만들지 않는다** — 페이지마다 셸을 렌더해야 이동 때 스크롤러가 다시 마운트되어
 * 스크롤이 맨 위로 가고 포커스도 다시 받는다. `/docs`만 레이아웃이 셸을 들고(`bare`) 스크롤러는 페이지가 든다 — 같은 규칙이다.
 *
 * ⚠️ **`h-svh`이고 `min-h-svh`가 아니다**(DESIGN §6.5, malmoi#13) — 최소 높이면 내용이 셸을 밀어 문서가
 * 스크롤되고 헤더가 딸려 올라간다. 스크롤은 패널 안 스크롤러 하나만 한다.
 *
 * ⚠️ **패널이 두 겹이다**(앱 셸 `ContentPanel` + `PanelBody`와 같은 형) — 바깥 `<main>`이 표면이고 모서리를
 * 자르므로 안쪽 스크롤러의 스크롤바 트랙이 radius 밖으로 나가지 않는다. 랜드마크는 `<main>` 하나다.
 *
 * ⚠️ **`min-w-[1280px]`**: 그 아래는 가로 스크롤이 정상이다(DESIGN §5 — 앱 셸과 같다).
 */
export function PublicShell({
  cta,
  current,
  bare = false,
  children,
}: {
  /** 세션 판정은 페이지가 한다(`publicCta`) — 헤더는 세션을 직접 읽지 않는다. */
  cta: PublicCta;
  /** 헤더 링크 중 지금 서 있는 곳. `/privacy`처럼 헤더에 없는 화면이면 비운다. */
  current?: "home" | "docs";
  /**
   * 패널 안을 스크롤러로 감싸지 않는다 — `/docs`는 레이아웃이 셸과 내비를 들고 **페이지가 본문 스크롤러를 든다**
   * (DESIGN §6.61). 셸을 레이아웃에 두면 스크롤러가 재마운트되지 않으므로, 그 자리를 페이지로 내린 것이다.
   */
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {/*
        ⚠️ **`body`까지 칠해야 오버스크롤에서 흰 띠가 안 보인다** — `components/signin/auth-layout.tsx`와 같은 형이다.
        effect로 클래스를 붙이면 첫 페인트를 놓친다.
      */}
      <style>{`body{background-color:var(--canvas)}`}</style>

      <div className="bg-canvas flex h-svh min-w-[1280px] flex-col overflow-hidden px-2 pt-2">
        <PublicHeader cta={cta} current={current} />
        <main className="border-border-subtle bg-background shadow-low relative flex min-h-0 flex-1 overflow-hidden rounded-xl border">
          {bare ? children : <PublicScroller>{children}</PublicScroller>}
        </main>
        <PublicFooter />
      </div>
    </>
  );
}
