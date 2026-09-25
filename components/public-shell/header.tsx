import Image from "next/image";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import type { PublicCta } from "@/lib/auth/landing";
import { m } from "@/lib/i18n";
import { GITHUB_REPO_URL } from "@/lib/links";
import { routes } from "@/lib/routes";
import logo from "@/public/brand/malmoi-icon-black.svg";

/** 시안 1a: 14/400 · 6/10 · radius 8 · hover `foreground` 알파 .03. */
const NAV_LINK =
  "rounded-sm px-2.5 py-1.5 text-sm hover:bg-foreground/3 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/**
 * 공개 셸 헤더 — 로고 · `Main` 내비 · 우측 primary (시안 1a · 1e).
 *
 * ⚠️ **선택 상태를 그리지 않는다** — 현재 화면(`current`)은 `aria-current="page"`만 든다. 헤더에 서는 항목이 셋뿐이라
 * 그리면 랜딩에서 항상 켜진 칸 하나가 되고, `/privacy`는 셋 어디에도 없다.
 *
 * ⚠️ **primary는 페이지가 정한다**(`publicCta`) — 랜딩은 늘 `Get started`(`ok`는 `/projects`로 redirect),
 * `/privacy`는 로그인이면 `Open Malmoi`다. 라벨은 사전 키로 온다(`lib/auth/landing.ts`가 잎이라서).
 *
 * ⚠️ **GitHub에 외부 링크 글리프를 붙이지 않는다**(DESIGN §6.3) — 새 탭으로만 연다.
 */
export function PublicHeader({ cta, current }: { cta: PublicCta; current?: "home" }) {
  return (
    <header className="mb-2 flex h-10 shrink-0 items-center gap-5 px-1">
      <Link
        href={routes.home()}
        aria-label={m.landing.shell.logo}
        className="focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        <Image src={logo} alt="" width={32} height={32} priority />
      </Link>
      <nav aria-label={m.landing.shell.nav} className="flex items-center gap-0.5">
        <Link href={routes.home()} aria-current={current === "home" ? "page" : undefined} className={NAV_LINK}>
          {m.landing.shell.home}
        </Link>
        <Link href={routes.docs()} className={NAV_LINK}>
          {m.landing.shell.docs}
        </Link>
        <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className={NAV_LINK}>
          {m.landing.shell.github}
        </a>
      </nav>
      <div className="ml-auto flex">
        <ButtonLink href={cta.href} variant="primary" size="md">
          {m.landing.shell[cta.label]}
        </ButtonLink>
      </div>
    </header>
  );
}
