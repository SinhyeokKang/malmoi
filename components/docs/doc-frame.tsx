import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Toc } from "@/components/public-doc-toc";
import type { TocItem } from "@/lib/guide/toc";
import { m } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ROW_HOVER = "hover:bg-foreground/3 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/**
 * 본문 스크롤러 안의 그릇 — **Privacy 그릇 그대로**(DESIGN §6.61 · 시안 `Docs.dc.html` 1b): 본문 720 + 목차 200 · 사이 64 ·
 * 최대 1064 가운데 · 위 64 아래 120. 목차가 없으면(H2 둘 미만 · 개요 · 장 개요) **열만 비운다** — 본문 폭이 페이지마다 흔들리지 않는다.
 */
export function DocFrame({ toc, children }: { toc: readonly TocItem[]; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1064px] grid-cols-[minmax(0,720px)_200px] justify-between gap-16 px-10 pt-16 pb-30">
      <article className="min-w-0">{children}</article>
      {toc.length === 0 ? <div /> : <Toc label={m.publicDocs.docs.toc} items={toc.map(({ id, text }) => ({ id, heading: text }))} />}
    </div>
  );
}

/** h1 위 줄 — SUMMARY의 부모 장 이름(13 muted, 링크 아님). 장 개요·개요 페이지엔 없다. */
export function DocEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground m-0 mb-2 text-xs">{children}</p>;
}

export type DocLinkRow = { href: string; title: string; description: string | null };

/** 장 개요의 하위 목록 · 개요의 `More in the docs` — 카드 한 장 안의 행(제목 15/500 · 설명 14 muted · 화살표). */
export function DocRows({ rows, className }: { rows: readonly DocLinkRow[]; className?: string }) {
  return (
    <ul className={cn("border-border divide-border m-0 list-none divide-y overflow-hidden rounded-lg border p-0", className)}>
      {rows.map((row) => (
        <li key={row.href}>
          <Link href={row.href} className={cn("flex items-center gap-4 px-4 py-3", ROW_HOVER)}>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium">{row.title}</span>
              {row.description === null ? null : <span className="text-muted-foreground mt-0.5 block text-sm leading-[1.6]">{row.description}</span>}
            </span>
            <ArrowRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type DocTrack = { audience: string; chapter: DocLinkRow; pages: readonly { href: string; title: string }[] };

/**
 * 개요의 **두 갈래 카드**(시안 1a) — 위는 장 개요로(대상 13 muted · 제목 18/500 · 설명 14 muted), 아래 행 셋(44)은 그 장의 첫 할 일.
 * 셸이 역할을 읽지 않으므로 갈래는 여기서 준다(spec — 사이드바 Docs는 역할과 무관하게 개요로 온다).
 */
export function DocTracks({ tracks }: { tracks: readonly DocTrack[] }) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-4">
      {tracks.map((track) => (
        <div key={track.chapter.href} className="border-border overflow-hidden rounded-lg border">
          <Link href={track.chapter.href} className={cn("block p-4", ROW_HOVER)}>
            <span className="text-muted-foreground block text-xs">{track.audience}</span>
            <span className="mt-1 block text-lg font-medium">{track.chapter.title}</span>
            {track.chapter.description === null ? null : (
              <span className="text-muted-foreground mt-1 block text-sm leading-[1.6]">{track.chapter.description}</span>
            )}
          </Link>
          <ul className="divide-border border-border m-0 list-none divide-y border-t p-0">
            {track.pages.map((page) => (
              <li key={page.href}>
                <Link href={page.href} className={cn("flex h-11 items-center justify-between gap-3 px-4 text-sm", ROW_HOVER)}>
                  {page.title}
                  <ArrowRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** 이전/다음 — 본문 끝 위 64 · 선 뒤 반반 카드(p16 · 라벨 13 muted · 제목 15/500). SUMMARY 선위 순서, 장 경계를 넘는다. */
export function DocNeighbours({ previous, next }: { previous: { href: string; title: string } | null; next: { href: string; title: string } | null }) {
  if (previous === null && next === null) return null;
  const card = (item: { href: string; title: string }, label: string, className: string) => (
    <Link href={item.href} className={cn("border-border block rounded-lg border p-4", ROW_HOVER, className)}>
      <span className="text-muted-foreground block text-xs">{label}</span>
      <span className="mt-1 block text-base font-medium">{item.title}</span>
    </Link>
  );
  return (
    <nav aria-label={m.publicDocs.docs.pages} className="border-border mt-16 grid grid-cols-2 gap-4 border-t pt-6">
      {previous === null ? null : card(previous, m.publicDocs.docs.previous, "")}
      {next === null ? null : card(next, m.publicDocs.docs.next, "col-start-2 text-right")}
    </nav>
  );
}
