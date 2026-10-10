import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DocsNavSheet } from "@/components/docs/nav-sheet";
import { DocsNavTree } from "@/components/docs/nav-tree";
import { PublicShell } from "@/components/public-shell/public-shell";
import { publicAccount } from "@/lib/auth/landing";
import { readSession } from "@/lib/auth/read-session";
import { docHref } from "@/lib/guide/href";
import { loadSummary } from "@/lib/guide/load";
import { flattenNav } from "@/lib/guide/summary";
import { getMessages, getUiLocale } from "@/lib/i18n/server";
import { DOCS_TITLE } from "@/lib/seo/site";

export const metadata: Metadata = { title: { template: `%s · ${DOCS_TITLE}`, default: DOCS_TITLE } };

/**
 * `/docs/*`의 공개 셸 + 문서 내비 (DESIGN §6.61 · 시안 `Docs.dc.html` 1a–1d).
 *
 * ⚠️ **셸이 레이아웃에 있는 유일한 공개 화면이다** — 내비(264 · 제 안에서 스크롤)가 페이지 이동에 스크롤과 포커스를
 * 남기려면 레이아웃이 들어야 한다. 대신 **본문 스크롤러는 페이지가 든다**(`bare`) — 페이지마다 재마운트되어 맨 위에서
 * 시작하고 포커스를 받는 §6.615의 규칙이 그대로 선다.
 *
 * ⚠️ **인가를 지나지 않는다** — 공개 문서다(`entry-points.test.ts`의 `EXEMPT`). 세션은 헤더 primary 하나 때문에 읽는다.
 * ⚠️ **좁은 폭(`lg` 미만)은 고정 내비 대신 하단 캡슐 + 전체 화면 시트다**(responsive-public D1) — 캡슐은 셸 `<main>`(relative)의 바닥에 떠서
 * 페이지가 바뀌어도 남는다. 본문 아래 120(`DocFrame`)이 마지막 줄을 캡슐 위로 올린다.
 * ⚠️ **SUMMARY를 못 읽으면 던진다**(`loadSummary`) — 빈 내비로 삼키면 트레이스 누락이 "모든 페이지 404"로 둔갑한다.
 */
export default async function DocsLayout({ children }: { children: ReactNode }) {
  const [session, m] = await Promise.all([readSession(), getMessages()]);
  // 내비 제목은 화면 언어의 SUMMARY다 — 본문(페이지)과 같은 트리를 읽어야 제목이 둘로 갈리지 않는다
  const nav = loadSummary(await getUiLocale());

  return (
    <PublicShell m={m} account={publicAccount(session)} current="docs" bare>
      {/* 고정 내비는 `lg` 이상만이다 — 좁으면 본문 위 캡슐이 같은 트리를 전체 화면 시트로 연다(responsive-public PT2c). `data-docs-nav`는 넓어질 때 시트가 포커스를 넘길 표식이다. */}
      <nav aria-label={m.publicDocs.docs.nav} data-docs-nav="" className="border-border w-[264px] shrink-0 overflow-y-auto border-r p-4 max-lg:hidden">
        <DocsNavTree nav={nav} />
      </nav>
      {children}
      <DocsNavSheet pages={flattenNav(nav).map((item) => ({ href: docHref(item.slug), title: item.title }))} label={m.publicDocs.docs.nav} title={m.publicDocs.docs.title} closeLabel={m.common.close}>
        <DocsNavTree nav={nav} />
      </DocsNavSheet>
    </PublicShell>
  );
}
