import type { ReactNode } from "react";

import { DocsNavLink } from "@/components/docs/nav-link";
import { PublicShell } from "@/components/public-shell/public-shell";
import { publicCta } from "@/lib/auth/landing";
import { readSession } from "@/lib/auth/read-session";
import { docHref } from "@/lib/guide/href";
import { loadSummary } from "@/lib/guide/load";
import { m } from "@/lib/i18n";

/**
 * `/docs/*`의 공개 셸 + 문서 내비 (DESIGN §6.61 · 시안 `Docs.dc.html` 1a–1d).
 *
 * ⚠️ **셸이 레이아웃에 있는 유일한 공개 화면이다** — 내비(264 · 제 안에서 스크롤)가 페이지 이동에 스크롤과 포커스를
 * 남기려면 레이아웃이 들어야 한다. 대신 **본문 스크롤러는 페이지가 든다**(`bare`) — 페이지마다 재마운트되어 맨 위에서
 * 시작하고 포커스를 받는 §6.615의 규칙이 그대로 선다.
 *
 * ⚠️ **인가를 지나지 않는다** — 공개 문서다(`entry-points.test.ts`의 `EXEMPT`). 세션은 헤더 primary 하나 때문에 읽는다.
 * ⚠️ **SUMMARY를 못 읽으면 던진다**(`loadSummary`) — 빈 내비로 삼키면 트레이스 누락이 "모든 페이지 404"로 둔갑한다.
 */
export default async function DocsLayout({ children }: { children: ReactNode }) {
  const session = await readSession();
  const nav = loadSummary();

  return (
    <PublicShell cta={publicCta(session.status)} current="docs" bare>
      <nav aria-label={m.publicDocs.docs.nav} className="border-border w-[264px] shrink-0 overflow-y-auto border-r p-4">
        <ul className="m-0 list-none space-y-3 p-0">
          {nav.map((chapter) => (
            <li key={chapter.file}>
              <DocsNavLink href={docHref(chapter.slug)} chapter>
                {chapter.title}
              </DocsNavLink>
              {chapter.children.length === 0 ? null : (
                <ul className="m-0 list-none p-0">
                  {chapter.children.map((page) => (
                    <li key={page.file}>
                      <DocsNavLink href={docHref(page.slug)} chapter={false}>
                        {page.title}
                      </DocsNavLink>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </PublicShell>
  );
}
