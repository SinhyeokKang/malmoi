import type { ReactNode } from "react";

import { LandingFooter } from "./footer";
import { LandingHeader } from "./header";
import { LandingScroller } from "./scroller";

/**
 * 랜딩 셸 — 헤더 40 + 8 · 패널 · 푸터 40이 뷰포트 높이를 **정확히** 채운다 (시안 1a).
 *
 * ⚠️ **`h-svh`이고 `min-h-svh`가 아니다**(DESIGN §6.5, malmoi#13) — 최소 높이면 내용이 셸을 밀어 문서가
 * 스크롤되고 헤더가 딸려 올라간다. 스크롤은 패널 안 스크롤러 하나만 한다.
 *
 * ⚠️ **패널이 두 겹이다**(앱 셸 `ContentPanel` + `PanelBody`와 같은 형) — 바깥 `<main>`이 표면이고 모서리를
 * 자르므로 안쪽 스크롤러의 스크롤바 트랙이 radius 밖으로 나가지 않는다. 랜드마크는 `<main>` 하나다.
 *
 * ⚠️ **`min-w-[1280px]`**: 그 아래는 가로 스크롤이 정상이다(DESIGN §5 — 앱 셸과 같다).
 */
export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <>
      {/*
        ⚠️ **`body`까지 칠해야 오버스크롤에서 흰 띠가 안 보인다** — `components/signin/auth-layout.tsx`와 같은 형이다.
        effect로 클래스를 붙이면 첫 페인트를 놓친다.
      */}
      <style>{`body{background-color:var(--canvas)}`}</style>

      <div className="bg-canvas flex h-svh min-w-[1280px] flex-col overflow-hidden px-2 pt-2">
        <LandingHeader />
        <main className="border-border-subtle bg-background shadow-low relative flex min-h-0 flex-1 overflow-hidden rounded-xl border">
          <LandingScroller>{children}</LandingScroller>
        </main>
        <LandingFooter />
      </div>
    </>
  );
}
