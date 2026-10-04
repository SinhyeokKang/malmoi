import { LogIn } from "lucide-react";
import Link from "next/link";

import { SearchTrigger } from "@/components/search/search-trigger";
import { HeaderBar } from "@/components/shell/header-bar";
import { UserMenu } from "@/components/shell/user-menu";
import { GithubIcon } from "@/components/signin/brand-icons";
import { ButtonLink } from "@/components/ui/button";
import { MalmoiMark } from "@/components/ui/malmoi-mark";
import type { PublicAccount } from "@/lib/auth/landing";
import { signOutAction } from "@/lib/auth/sign-out";
import type { Messages } from "@/lib/i18n";
import { GITHUB_REPO_URL } from "@/lib/links";
import { routes } from "@/lib/routes";

/** 시안 1a: 14/500(2026-09-30 사용자 — 400에서 올렸다) · 6/10 · radius 8 · hover `foreground/[0.03]`. */
const NAV_LINK =
  "rounded-sm px-2.5 py-1.5 text-sm font-medium hover:bg-foreground/[0.03] focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/**
 * ⚠️ **버튼이 아니라 앱 사이드바 항목(`components/shell/sidebar.tsx`의 `Item`)과 같은 모양이다** (2026-09-28 사용자) — p 6 · gap 8 ·
 * radius 8 · 아이콘 16 · 14px, 보더 없이 hover 때만 면이 선다. 헤더도 사이드바처럼 캔버스 위에 얹혀 있어 같은 알파가 같은 면이다.
 * ⚠️ **앱 셸 헤더의 New project도 이 값이다** (2026-09-30 사용자 — 같은 패턴에서 GitHub 자리만 바뀐다). 한 벌로 둔다.
 */
export const PUBLIC_HEADER_LINK =
  "text-foreground flex items-center gap-2 rounded-sm p-1.5 text-sm font-medium hover:bg-foreground/[0.03] focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

export type HeaderCurrent = "docs" | "changelog";

/**
 * 공개 셸 헤더 — 로고 · `Main` 내비(`Docs · Changelog`) · 가운데 검색 · 우측 GitHub | primary (시안 1a · 1e).
 *
 * ⚠️ **`Home`이 없다** (2026-09-28 사용자) — 로고가 곧 홈 링크다(`aria-label` `Malmoi home`).
 * ⚠️ **GitHub는 내비가 아니라 우측, primary 왼쪽이다** (같은 날 — 내비는 앱 안 목적지만 든다는 판정은 그대로다). primary와 사이에 연한 세로선 하나.
 *
 * ⚠️ **선택 상태를 그리지 않는다** — 현재 화면(`current`)은 `aria-current="page"`만 든다. 헤더에 서는 항목이 둘뿐이라
 * 그리면 늘 켜진 칸 하나가 되고, 랜딩·`/privacy`는 둘 어디에도 없다. `/docs/*`는 `docs`다(시안 `Docs.dc.html` 1a).
 *
 * ⚠️ **primary는 페이지가 정한다**(`publicAccount`) — 비로그인(장애 포함)은 `Get started`, 로그인이면 **앱 셸과 같은 아바타 메뉴**다
 * (옛 `Open Malmoi` 버튼 대체). 헤더는 세션을 직접 읽지 않는다. 랜딩은 `ok`에서 안 그려져 늘 `Get started`다.
 */
export function PublicHeader({ m, account, current }: { m: Messages; account: PublicAccount | null; current?: HeaderCurrent }) {
  return (
    <HeaderBar
      className="mb-1.5"
      center={<SearchTrigger account={account} />}
      start={
        <div className="flex items-center gap-5">
          <Link
            href={routes.home()}
            aria-label={m.landing.shell.logo}
            className="focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <MalmoiMark size={32} />
          </Link>
          <nav aria-label={m.landing.shell.nav} className="flex items-center gap-0.5">
            <Link href={routes.docs()} aria-current={current === "docs" ? "page" : undefined} className={NAV_LINK}>
              {m.landing.shell.docs}
            </Link>
            <Link href={routes.changelog()} aria-current={current === "changelog" ? "page" : undefined} className={NAV_LINK}>
              {m.changelog.title}
            </Link>
          </nav>
        </div>
      }
      end={
        <div className="flex items-center gap-3">
          {/* 외부 링크 — 새 탭 + `noreferrer`(공개 셸의 외부 링크 규칙). */}
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className={PUBLIC_HEADER_LINK}>
            <GithubIcon className="size-4 shrink-0" />
            {m.landing.shell.github}
          </a>
          {/* 장식이다 — 캔버스(#f5f6f7) 위에서 보이는 가장 연한 선이 `border-border-subtle`이다(`divider`는 캔버스보다 옅어 안 보인다). */}
          <span aria-hidden className="bg-border-subtle h-5 w-px" />
          {account === null ? (
            <ButtonLink href={routes.signIn()} variant="primary" size="md">
              <LogIn aria-hidden />
              {m.landing.shell.getStarted}
            </ButtonLink>
          ) : (
            <UserMenu name={account.name} email={account.email} image={account.image} signOut={signOutAction} />
          )}
        </div>
      }
    />
  );
}
