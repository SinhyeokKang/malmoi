import Link from "next/link";

import { m } from "@/lib/i18n";
import { FOOTER_LINKS } from "@/lib/links";

const LINK = "hover:text-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/**
 * 공개 셸 푸터 — 40 · 13 · muted (시안 1a).
 *
 * ⚠️ **소비자가 둘이다** — 공개 셸(`/` · `/privacy`)과 셸 밖 2열 골격(`AuthLayout` — `/signin` · 초대 · 계정 병합, 2026-09-26부터
 * 두 패널 아래). 링크 목록은 `FOOTER_LINKS` 한 상수다 — 순서 `GitHub · Privacy Policy · Docs`.
 * 시안은 `Docs · Privacy Policy`였고 2026-09-26 사용자가 로그인 쪽 순서로 판정했다.
 */
export function PublicFooter() {
  return (
    <footer className="text-muted-foreground flex h-10 shrink-0 items-center justify-center gap-4 text-xs">
      <span>{m.signIn.footer.copyright}</span>
      {FOOTER_LINKS.map(({ href, label, external }) =>
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
    </footer>
  );
}
