import Link from "next/link";

import { ThemeSwitcher } from "@/components/color-scheme/theme-switcher";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import type { Messages } from "@/lib/i18n";
import { footerLinks } from "@/lib/links";

import { WideOnly } from "./nav-drawer";

const LINK = "hover:text-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/**
 * 공개 셸 푸터 — 40 · 13 · muted (시안 1a).
 *
 * ⚠️ **소비자가 둘이다** — 공개 셸(`/` · `/privacy` · `/docs/*` · `/changelog`)과 셸 밖 골격(`AuthLayout` — `/signin` · 초대 · 계정 병합, 2026-09-26부터
 * 패널 줄 아래). 링크 목록은 `footerLinks(m)` 한 목록이다 — `GitHub · Privacy Policy` 둘이다(`Docs`·`Changelog`는 2026-09-28에 빠졌다 — 헤더가 든다).
 * 시안은 `Docs · Privacy Policy`였고 2026-09-26 사용자가 로그인 쪽 순서로 판정했다.
 * ⚠️ **좌우로 갈린다** (2026-10-09 사용자 — ui-locales design §5.1의 "가운데 한 줄 · 좌우 분리 없음"을 뒤집었다): 저작권 · 링크는 왼쪽 끝,
 * 언어 · 테마 스위처는 오른쪽 끝 묶음이다(2026-10-10 사용자 — 테마가 언어 오른쪽에 붙었다, 묶음 안 간격은 왼쪽과 같은 20).
 * `px-1`은 헤더(`HeaderBar`)와 같은 안쪽 여백이라 양끝이 헤더 내용의 양끝과 맞는다. 푸터는 서버 컴포넌트로 남고 스위처만 클라이언트다.
 *
 * ⚠️ **`lg` 미만은 셸마다 갈린다** (responsive-public PT1a·PT3a) — 공개 셸(`drawer`)은 왼쪽 묶음만 남고 스위처는 서랍 바닥으로 간다(셸이 `h-svh`라
 * 푸터를 두 줄로 늘리면 패널이 준다). 기본(Auth — 서랍이 없어 스위처가 갈 곳이 푸터뿐이다)은 링크 / 스위처 두 줄로 감기고 높이는 내용이 정한다.
 */
export function PublicFooter({ m, drawer = false }: { m: Messages; drawer?: boolean }) {
  const switchers = <><LocaleSwitcher /><ThemeSwitcher /></>;
  // 두 줄 형은 줄마다 20이다(#219 · 시안 PT3 — 10 + 20 + 4 + 20 + 10 = 64). 행간은 링크 줄에, 줄 최소 높이는 스위처 줄에 든다 — `TextTrigger`가
  // 자기 `text-xs` 행간(≈17.3)을 들어 푸터의 행간을 물려받지 않는다.
  const group = drawer ? "flex items-center gap-5 whitespace-nowrap" : "flex items-center gap-5 whitespace-nowrap max-lg:min-h-5";
  return (
    <footer className={drawer
      ? "text-muted-foreground flex h-10 shrink-0 items-center justify-between gap-5 px-1 text-xs"
      : "text-muted-foreground flex h-10 shrink-0 items-center justify-between gap-5 px-1 text-xs max-lg:h-auto max-lg:flex-wrap max-lg:gap-y-1 max-lg:py-2.5 max-lg:leading-5"}>
      <div className={group}>
        <span>{m.signIn.footer.copyright}</span>
        {footerLinks(m).map(({ href, label, external }) =>
          external ? (
            <a key={href} href={href} target="_blank" rel="noreferrer" className={LINK}>
              {label}
            </a>
          ) : (
            <Link key={href} href={href} className={LINK}>
              {label}
            </Link>
          ),
        )}
      </div>
      {drawer
        ? <WideOnly className="flex items-center gap-5 max-lg:hidden">{switchers}</WideOnly>
        : <div className={group}>{switchers}</div>}
    </footer>
  );
}
