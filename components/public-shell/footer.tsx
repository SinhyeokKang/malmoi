import Link from "next/link";

import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import type { Messages } from "@/lib/i18n";
import { footerLinks } from "@/lib/links";

const LINK = "hover:text-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/**
 * 공개 셸 푸터 — 40 · 13 · muted (시안 1a).
 *
 * ⚠️ **소비자가 둘이다** — 공개 셸(`/` · `/privacy` · `/docs/*` · `/changelog`)과 셸 밖 골격(`AuthLayout` — `/signin` · 초대 · 계정 병합, 2026-09-26부터
 * 패널 줄 아래). 링크 목록은 `footerLinks(m)` 한 목록이다 — `GitHub · Privacy Policy` 둘이다(`Docs`·`Changelog`는 2026-09-28에 빠졌다 — 헤더가 든다).
 * 시안은 `Docs · Privacy Policy`였고 2026-09-26 사용자가 로그인 쪽 순서로 판정했다.
 * ⚠️ **언어 스위처가 가운데 줄의 마지막 항목이다**(ui-locales design §5.1) — 바닥 띠 40에 좌우 분리를 들이지 않는다. 푸터는 서버 컴포넌트로 남고 스위처만 클라이언트다.
 */
export function PublicFooter({ m }: { m: Messages }) {
  return (
    <footer className="text-muted-foreground flex h-10 shrink-0 items-center justify-center gap-5 text-xs">
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
      <LocaleSwitcher />
    </footer>
  );
}
