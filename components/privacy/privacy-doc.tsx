import { DocTable } from "@/components/public-doc-table";
import { m } from "@/lib/i18n";

import { Toc } from "./toc";

/**
 * `/privacy`의 읽기 그릇 — 공개 셸 패널 안에 선다 (시안 `Landing.dc.html` 1e · `Landing Prototype.dc.html` `isPrivacy`,
 * DESIGN §6.616). `/docs`는 셸 밖 1열(`components/public-doc.tsx`, §6.61)이고 표(`DocTable`)만 공유한다.
 *
 * ⚠️ **`<main>`을 그리지 않는다** — 랜드마크는 셸의 `<main>` 하나다.
 * ⚠️ **복귀 링크가 없다** — 헤더(로고 · Home · primary)가 나가는 길을 든다.
 * ⚠️ **본문은 사전 그대로다** (`m.publicDocs.privacy`) — 고치면 `effectiveDate`와 개정 이력이 따라와야 한다.
 */
export function PrivacyDoc() {
  const { title, effectiveDate, intro, sections } = m.publicDocs.privacy;

  return (
    <div className="mx-auto grid max-w-[1120px] grid-cols-[minmax(0,720px)_200px] justify-between gap-16 px-10 py-30">
      <article className="min-w-0">
        <h1 className="m-0 text-4xl leading-[1.3] font-medium">{title}</h1>
        {/*
          메타 줄이라 보조 색이 맞다 — 본문의 muted 금지는 여기 안 걸린다(§6.61). 라벨 없이 날짜만 두면 무슨 날짜인지 모른다.
          사전의 `"YYYY-MM-DD"`를 그대로 보이고 `dateTime`에 넣는다 — 날짜만 든 `datetime`은 올바른 HTML이고
          `lib/utc-time.ts`를 먹이면 분까지 붙는다.
        */}
        <p className="text-muted-foreground mt-3 text-sm leading-[1.6]">
          {m.publicDocs.effectiveDate} <time dateTime={effectiveDate}>{effectiveDate}</time>
        </p>
        <p className="text-prose mt-6 leading-[1.75] text-pretty">{intro}</p>
        <hr className="border-border mt-10" />
        {sections.map((section, index) => (
          // 이름 없는 `<section>`을 두지 않는다 (POSTMORTEM 2026-09-15) — 이름은 `<h2 id>`가 댄다.
          // `[&_a]:`가 사전이 맨몸으로 내놓는 `<a>`에 색을 건다 (§6.3 — 셸 밖 링크는 파랑, 밑줄 없음).
          <section key={section.id} aria-labelledby={section.id} className={`${index === 0 ? "mt-12" : "mt-14"} [&_a]:text-blue-600`}>
            {/*
              `scroll-mt-12` — 하드 해시 착지도 목차 클릭과 같은 48 아래에 선다.
              `tabIndex={-1}` — 목차가 누른 절로 포커스를 옮긴다(`toc.tsx`). 조작 대상이 아니라 링을 그리지 않는다.
            */}
            <h2 id={section.id} tabIndex={-1} className="m-0 scroll-mt-12 text-2xl leading-[1.4] font-medium focus:outline-none">
              {section.heading}
            </h2>
            {section.blocks.map((block, blockIndex) =>
              "p" in block ? (
                <p key={blockIndex} className="text-prose mt-4 leading-[1.75]">
                  {block.p}
                </p>
              ) : "ul" in block ? (
                <ul key={blockIndex} className="text-prose mt-4 list-disc space-y-2 pl-[22px] leading-[1.75]">
                  {block.ul.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              ) : (
                // 셀 14/1.6 · 머리 13/500 muted — `/docs`의 표와 형은 같고 급만 이 그릇이 누른다.
                <DocTable
                  key={blockIndex}
                  table={block.table}
                  className="border-border mt-6 min-w-0 overflow-auto rounded-lg border [&_td]:leading-[1.6] [&_th]:text-muted-foreground [&_th]:text-xs"
                />
              ),
            )}
          </section>
        ))}
      </article>
      <Toc label={m.publicDocs.privacy.toc} items={sections.map(({ id, heading }) => ({ id, heading }))} />
    </div>
  );
}
