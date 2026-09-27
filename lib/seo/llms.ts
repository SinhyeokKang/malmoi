import { docHref } from "@/lib/guide/href";
import type { FlatNavItem, NavNode } from "@/lib/guide/summary";
import { m } from "@/lib/i18n";

import { SITE_ORIGIN } from "./site";

/**
 * `/llms.txt`·`/llms-full.txt` 본문. ⚠️ **결정적이다** — 같은 `guide/` 상태에서 같은 바이트(불변식 4의 정신: 크롤러가 "바뀜"을
 * 판단하는 재료다). 순서는 SUMMARY 하나이고, 요약·원고는 **파일 경로**로 찾는다.
 */
const url = (slug: readonly string[]) => `${SITE_ORIGIN}${docHref(slug)}`;

/** 링크 텍스트 안에서 링크를 닫거나 여는 글자만 막는다 — 나머지(`&`·`*`)는 원고의 제목 그대로다. */
const linkText = (title: string) => title.replace(/[\\[\]]/g, (c) => `\\${c}`);

/** llmstxt.org 형 목차 — `# Malmoi` · `> 요약` · 장마다 `## 장` + 장 자신과 하위 페이지 목록. 요약이 없으면 `: …` 없이 끝난다. */
export function llmsIndex(nav: readonly NavNode[], leads: ReadonlyMap<string, string | null>): string {
  const item = ({ title, slug, file }: NavNode) => {
    const lead = leads.get(file) ?? null;
    return `- [${linkText(title)}](${url(slug)})${lead === null ? "" : `: ${lead}`}`;
  };
  const chapters = nav.map((chapter) => [`## ${chapter.title}`, "", item(chapter), ...chapter.children.map(item)].join("\n"));
  return `${[`# ${m.common.appName}`, `> ${m.landing.hero.body}`, ...chapters].join("\n\n")}\n`;
}

/**
 * 가이드 원고 전문 — 항목마다 `# 제목` · `Source: <절대 URL>` · 원고 **원문 그대로**(seo-geo spec D5 — 상대 `.md` 링크·`{#id}`를
 * 재작성하지 않는다. 재작성엔 `remark-stringify` 새 의존성이 필요하다). 구분은 `---`.
 */
export function llmsFull(flat: readonly FlatNavItem[], sources: ReadonlyMap<string, string>): string {
  const pages = flat.map(({ title, slug, file }) => `# ${title}\nSource: ${url(slug)}\n\n${(sources.get(file) ?? "").trimEnd()}`);
  return `${pages.join("\n\n---\n\n")}\n`;
}
