import { docHref } from "@/lib/guide/href";
import { resolveDocLink } from "@/lib/guide/collect";
import { parseMd } from "@/lib/guide/parse";
import type { FlatNavItem, NavNode } from "@/lib/guide/summary";
import { GITHUB_REPO_URL } from "@/lib/links";
import { en } from "@/messages/en";
import type { Definition, Link } from "mdast";
import { visit } from "unist-util-visit";

import { SITE_ORIGIN } from "./site";

/**
 * `/llms.txt`·`/llms-full.txt` 본문. ⚠️ **결정적이다** — 같은 `guide/` 상태에서 같은 바이트(불변식 4의 정신: 크롤러가 "바뀜"을
 * 판단하는 재료다). 순서는 SUMMARY 하나이고, 요약·원고는 **파일 경로**로 찾는다.
 */
const url = (slug: readonly string[]) => `${SITE_ORIGIN}${docHref(slug)}`;

const FACTS =
  "Malmoi currently has no paid plans and is open source under the MIT License. It works with GitHub repositories and supports external AI agents over MCP. It does not provide translation memory, built-in machine or AI translation, ICU plural or select syntax, approval workflows, fine-grained permissions, real-time co-editing, in-context editing, screenshot attachments, or translator notes.";

const OPTIONAL = [
  "## Optional",
  "",
  `- [Full documentation](${SITE_ORIGIN}/llms-full.txt)`,
  `- [Changelog](${SITE_ORIGIN}/changelog)`,
  `- [Privacy](${SITE_ORIGIN}/privacy)`,
  `- [GitHub](${GITHUB_REPO_URL})`,
].join("\n");

/** 링크 텍스트 안에서 링크를 닫거나 여는 글자만 막는다 — 나머지(`&`·`*`)는 원고의 제목 그대로다. */
const linkText = (title: string) => title.replace(/[\\[\]]/g, (c) => `\\${c}`);

/** llmstxt.org 형 목차 — `# Malmoi` · `> 요약` · 장마다 `## 장` + 장 자신과 하위 페이지 목록. 요약이 없으면 `: …` 없이 끝난다. */
export function llmsIndex(nav: readonly NavNode[], leads: ReadonlyMap<string, string | null>): string {
  const item = ({ title, slug, file }: NavNode) => {
    // `leadParagraph`는 soft break를 `\n`으로 남긴다 — 그대로 실으면 목록 항목이 끊긴다.
    const lead = leads.get(file)?.replace(/\s+/g, " ").trim() || null;
    return `- [${linkText(title)}](${url(slug)})${lead === null ? "" : `: ${lead}`}`;
  };
  const chapters = nav.map((chapter) => [`## ${chapter.slug.length === 0 ? "Overview" : chapter.title}`, "", item(chapter), ...chapter.children.map(item)].join("\n"));
  return `${[`# ${en.common.appName}`, `> ${en.landing.hero.body}`, FACTS, ...chapters, OPTIONAL].join("\n\n")}\n`;
}

type Replacement = { start: number; end: number; value: string };

function offsets(node: Link | Definition): { start: number; end: number } | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? null : { start, end };
}

/** 파서가 확정한 링크 노드 안에서 destination의 원문 span만 찾는다. 제목·괄호·angle bracket은 건드리지 않는다. */
function destinationSpan(source: string, node: Link | Definition): { start: number; end: number } | null {
  const range = offsets(node);
  if (!range) return null;

  let cursor: number;
  if (node.type === "link") {
    const lastChildEnd = node.children[node.children.length - 1]?.position?.end.offset;
    cursor = lastChildEnd ?? range.start + 1;
    while (cursor < range.end && source[cursor] !== "]") cursor += 1;
    if (source[cursor] !== "]" || source[cursor + 1] !== "(") return null;
    cursor += 2;
  } else {
    cursor = range.start + 1;
    while (cursor < range.end) {
      if (source[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (source[cursor] === "]" && source[cursor + 1] === ":") break;
      cursor += 1;
    }
    if (cursor >= range.end) return null;
    cursor += 2;
  }

  while (cursor < range.end && /\s/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] === "<") {
    const start = cursor + 1;
    cursor = start;
    while (cursor < range.end && source[cursor] !== ">") cursor += source[cursor] === "\\" ? 2 : 1;
    return cursor < range.end ? { start, end: cursor } : null;
  }

  const start = cursor;
  if (node.url.length === 0) return { start, end: start };
  let nested = 0;
  while (cursor < range.end) {
    const char = source[cursor];
    if (char === "\\") {
      cursor += 2;
      continue;
    }
    if (char === "(") nested += 1;
    else if (char === ")") {
      if (nested === 0) break;
      nested -= 1;
    } else if (/\s/.test(char ?? "") && nested === 0) break;
    cursor += 1;
  }
  return cursor > start ? { start, end: cursor } : null;
}

/** mdast의 링크 판정과 위치를 써서 내부 문서 destination만 치환한다. stringify하지 않아 나머지 바이트는 그대로다. */
function absoluteGuideLinks(source: string, fromFile: string): string {
  const tree = parseMd(source);
  const linkReferences = new Set<string>();
  const replacements: Replacement[] = [];

  visit(tree, "linkReference", (node) => {
    linkReferences.add(node.identifier);
  });
  visit(tree, (node) => {
    if (node.type !== "link" && (node.type !== "definition" || !linkReferences.has(node.identifier))) return;
    const resolved = resolveDocLink(fromFile, node.url);
    if (resolved.kind !== "doc") return;
    const span = destinationSpan(source, node);
    if (!span) throw new Error(`llms link position unavailable: ${fromFile}:${node.position?.start.line ?? "?"}`);
    replacements.push({ ...span, value: `${SITE_ORIGIN}${resolved.href}` });
  });

  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce((text, replacement) => `${text.slice(0, replacement.start)}${replacement.value}${text.slice(replacement.end)}`, source);
}

/**
 * 가이드 원고 전문 — 항목마다 `# 제목` · `Source: <절대 URL>` · 원고 본문. 내부 문서 링크 destination만 절대 URL로 바꾸고
 * 나머지 원문(코드·이미지·제목·공백)은 보존한다. 구분은 `---`.
 */
export function llmsFull(flat: readonly FlatNavItem[], sources: ReadonlyMap<string, string>): string {
  const pages = flat.map(({ title, slug, file }) => `# ${title}\nSource: ${url(slug)}\n\n${absoluteGuideLinks(sources.get(file) ?? "", file).trimEnd()}`);
  return `${pages.join("\n\n---\n\n")}\n`;
}
