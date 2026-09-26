import { notFound } from "next/navigation";

import { DocEyebrow, DocFrame, DocNeighbours, DocRows, DocTracks, type DocLinkRow } from "@/components/docs/doc-frame";
import { GuideMarkdown } from "@/components/docs/guide-markdown";
import { LegacyHashRedirect } from "@/components/docs/legacy-hash";
import { PublicScroller } from "@/components/public-shell/scroller";
import { docHref } from "@/lib/guide/href";
import { LEGACY_ANCHORS } from "@/lib/guide/legacy-anchors";
import { loadPage, loadPageBySlug, loadShotSizes, loadSummary } from "@/lib/guide/load";
import { OVERVIEW_TRACKS } from "@/lib/guide/overview";
import { leadParagraph } from "@/lib/guide/sections";
import { flattenNav, type NavNode } from "@/lib/guide/summary";
import { extractToc } from "@/lib/guide/toc";
import { m } from "@/lib/i18n";

/**
 * `/docs`(개요) · `/docs/<slug>`(각 페이지) — 원고는 `guide/**.md`, 순서·계층은 `guide/SUMMARY.md` (DESIGN §6.61).
 *
 * ⚠️ **동적이다** — 레이아웃이 세션을 읽는다(헤더 primary). `generateStaticParams`가 없고, 없는 slug·`AUTHORING`·`SHOOTING`은
 * `loadPageBySlug`가 null을 줘 `notFound()` 한 줄이다(`app/docs/not-found.tsx`가 내비 안에서 받는다).
 * ⚠️ **본문 스크롤러를 여기서 든다** — `key`가 slug라 페이지 이동마다 재마운트되어 맨 위에서 시작하고 포커스를 받는다
 * (해시가 있으면 그 h2 — `PublicScroller`).
 *
 * ⚠️ **인가를 지나지 않는다** — 공개 문서다(`entry-points.test.ts`의 `EXEMPT`).
 */
export default async function DocsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const page = loadPageBySlug(slug);
  if (page === null) notFound();

  const nav = loadSummary();
  const flat = flattenNav(nav);
  const index = flat.findIndex((item) => item.file === page.file);
  const self = flat[index];
  const node = findNode(nav, page.file);
  const row = (item: { title: string; slug: string[]; file: string }): DocLinkRow => ({
    href: docHref(item.slug),
    title: item.title,
    description: leadParagraph(loadPage(item.file)),
  });
  const neighbour = (item: (typeof flat)[number] | undefined) => (item ? { href: docHref(item.slug), title: item.title } : null);

  // 개요(1a) — 두 갈래 + 나머지 장. 목차·이전/다음이 없다.
  if (slug.length === 0) {
    const bySlug = new Map(flat.map((item) => [item.slug.join("/"), item]));
    const pick = (key: string) => {
      const item = bySlug.get(key);
      // 상수의 slug는 테스트가 SUMMARY와 대조한다 — 여기 오면 원고와 상수가 같이 움직이지 않은 것이다.
      if (item === undefined) throw new Error(`overview slug not in SUMMARY: ${key}`);
      return item;
    };
    const tracks = OVERVIEW_TRACKS.map((track) => ({
      audience: m.publicDocs.docs[track.audience],
      chapter: row(pick(track.chapter)),
      pages: track.pages.map((key) => ({ href: docHref(pick(key).slug), title: pick(key).title })),
    }));
    const inTracks = new Set<string>(OVERVIEW_TRACKS.map((track) => track.chapter));
    const rest = nav.filter((chapter) => chapter.slug.length > 0 && !inTracks.has(chapter.slug.join("/"))).map(row);

    return (
      <PublicScroller key="">
        <LegacyHashRedirect table={LEGACY_ANCHORS} />
        <DocFrame toc={[]}>
          <GuideMarkdown tree={page.tree} file={page.file} sizes={loadShotSizes()} />
          <DocTracks tracks={tracks} />
          <h2 className="m-0 mt-14 text-2xl leading-[1.4] font-semibold">{m.publicDocs.docs.more}</h2>
          <DocRows rows={rest} arrow={false} className="mt-4" />
        </DocFrame>
      </PublicScroller>
    );
  }

  const children = node?.children ?? [];
  // 장 개요(1c) — 하위 목록은 원고가 아니라 SUMMARY 자식에서 붙인다. 목차가 없다.
  const chapterIndex = children.length > 0;

  return (
    <PublicScroller key={slug.join("/")}>
      <DocFrame toc={chapterIndex ? [] : extractToc(page.tree)}>
        {!chapterIndex && self?.parent ? <DocEyebrow>{self.parent}</DocEyebrow> : null}
        <GuideMarkdown tree={page.tree} file={page.file} sizes={loadShotSizes()} />
        {chapterIndex ? <DocRows rows={children.map(row)} arrow className="mt-10" /> : null}
        <DocNeighbours previous={neighbour(flat[index - 1])} next={neighbour(flat[index + 1])} />
      </DocFrame>
    </PublicScroller>
  );
}

function findNode(nodes: readonly NavNode[], file: string): NavNode | undefined {
  for (const node of nodes) {
    if (node.file === file) return node;
    const found = findNode(node.children, file);
    if (found) return found;
  }
  return undefined;
}
