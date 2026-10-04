import { LIST, PROSE, SECTION_HEADING } from "@/components/docs/classes";
import { DOC_TABLE, DocTable } from "@/components/public-doc-table";
import { Toc } from "@/components/public-doc-toc";
import type { Messages, PrivacyBody } from "@/lib/i18n";
import type { UiLocale } from "@/lib/i18n/locales";
import { utcDay } from "@/lib/utc-time";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * `/privacy`의 읽기 그릇 — 공개 셸 패널 안에 선다 (시안 `Landing.dc.html` 1e · `Landing Prototype.dc.html` `isPrivacy`,
 * DESIGN §6.616). `/docs`(`components/docs/`, §6.61)와 표(`DocTable`)·목차(`Toc`)를 공유한다.
 *
 * ⚠️ **`<main>`을 그리지 않는다** — 랜드마크는 셸의 `<main>` 하나다.
 * ⚠️ **복귀 링크가 없다** — 헤더(로고 · Home · primary)가 나가는 길을 든다.
 * ⚠️ **본문은 사전 그대로다** — `doc`은 페이지가 고른 본(en `en.publicDocs.privacy` · ko `messages/ko-privacy.tsx`)이다. 고치면 `effectiveDate`와
 * 개정 이력이 따라와야 한다. 셸 라벨(`m`)과 본문(`doc`)이 따로 오는 것은 es 화면이 es 셸 + en 본문이기 때문이다(ui-locales design §8).
 */
/** 3열 표의 열 폭 — 방침 문구가 아니라 열 수에서 온다. 셋째 열은 나머지다. */
const TABLE_3COL = "[&_th:nth-child(1)]:w-[34%] [&_th:nth-child(2)]:w-[26%]";

export function PrivacyDoc({ m, uiLocale, doc }: { m: Messages; uiLocale: UiLocale; doc: PrivacyBody }) {
  const { title, effectiveDate, intro, sections, tocLabels, toc } = doc;
  // 키가 절 `id`(사전 데이터)라 프로토타입을 끊고 찾는다 — `constructor` 같은 id가 `Object.prototype`에서 값을 얻지 않게.
  const labels: Readonly<Record<string, string>> = tocLabels;
  const tocItems = sections.map(({ id, heading }) => ({ id, heading: Object.hasOwn(labels, id) ? (labels[id] ?? heading) : heading }));

  return (
    <div className="mx-auto grid max-w-[1120px] grid-cols-[minmax(0,720px)_200px] justify-between gap-16 px-10 pt-16 pb-30">
      <article className="min-w-0">
        <h1 className="m-0 text-4xl leading-[1.3] font-semibold">{title}</h1>
        {/*
          메타 줄이라 보조 색이 맞다 — 본문의 muted 금지는 여기 안 걸린다(§6.61). 라벨 없이 날짜만 두면 무슨 날짜인지 모른다.
          사전의 `"YYYY-MM-DD"`는 `dateTime`에 그대로 넣고(날짜만 든 `datetime`은 올바른 HTML이다) 보이는 쪽만
          앱의 날짜 형(`utcDay`)이다 — 사전 값을 바꾸면 `policy-gate`가 개정 이력을 요구한다.
        */}
        <p className="text-muted-foreground mt-3 text-sm leading-body">
          {m.publicDocs.effectiveDate} <time dateTime={effectiveDate}>{utcDay(new Date(effectiveDate), uiLocale)}</time>
        </p>
        <p className={cn(PROSE, "mt-6")}>{intro}</p>
        <hr className="border-border mt-10" />
        {sections.map((section, index) => (
          // 이름 없는 `<section>`을 두지 않는다 (POSTMORTEM 2026-09-15) — 이름은 `<h2 id>`가 댄다.
          // `[&_a]:`가 사전이 맨몸으로 내놓는 `<a>`에 색과 링을 건다 (§6.3 — 셸 밖 링크는 파랑, 밑줄 없음 · §7).
          <section
            key={section.id}
            aria-labelledby={section.id}
            className={cn(
              // 절 간격은 공개 문서 공통 급(위 32)이다 — `<h2>`가 아니라 `<section>`이 든다(h2는 `m-0`).
              "mt-8",
              "[&_a]:text-link [&_a]:focus-visible:ring-ring [&_a]:focus-visible:ring-2 [&_a]:focus-visible:outline-none",
            )}
          >
            {/*
              `scroll-mt-12` — 하드 해시 착지도 목차 클릭과 같은 48 아래에 선다.
              `tabIndex={-1}` — 목차가 누른 절로 포커스를 옮긴다(`toc.tsx`). 조작 대상이 아니라 링을 그리지 않는다.
            */}
            <h2 id={section.id} tabIndex={-1} className={cn(SECTION_HEADING, "mt-0 scroll-mt-12 focus:outline-none")}>
              {section.heading}
            </h2>
            {section.blocks.map((block, blockIndex) =>
              "p" in block ? (
                <p key={blockIndex} className={PROSE}>
                  {block.p}
                </p>
              ) : "ul" in block ? (
                <ul key={blockIndex} className={`${LIST} list-disc`}>
                  {block.ul.map((item, itemIndex) => (
                    <li key={itemIndex}>{section.id === "changes" ? <RevisionLine item={item} uiLocale={uiLocale} /> : item}</li>
                  ))}
                </ul>
              ) : (
                <DocTable
                  key={blockIndex}
                  table={block.table}
                  className={cn(DOC_TABLE, block.table.head.length === 3 && TABLE_3COL)}
                />
              ),
            )}
          </section>
        ))}
      </article>
      <Toc label={toc} items={tocItems} />
    </div>
  );
}

/** 개정 이력 한 줄의 앞 날짜 — `YYYY-MM-DD — ` 꼴만 집는다. */
const REVISION = /^(\d{4}-\d{2}-\d{2}) — /;

/**
 * 개정 이력의 날짜를 머리의 시행일과 같은 형(`utcDay`)으로 보인다 (ux-drift-unify 2-Y19 — 한 페이지에서 머리는 `Sep 29, 2026`,
 * 이력은 ISO였다). ⚠️ **사전 값은 ISO 그대로다** — 본문 해시(`policy-gate.test.tsx`)가 사전을 보고, 날짜 형을 바꾸는 것은 방침 개정이
 * 아니다. 날짜로 시작하지 않는 줄은 그대로 둔다.
 */
function RevisionLine({ item, uiLocale }: { item: ReactNode; uiLocale: UiLocale }) {
  const match = typeof item === "string" ? REVISION.exec(item) : null;
  if (match === null || typeof item !== "string") return <>{item}</>;
  const iso = match[1] ?? "";
  return <><time dateTime={iso}>{utcDay(new Date(iso), uiLocale)}</time> — {item.slice(match[0].length)}</>;
}
