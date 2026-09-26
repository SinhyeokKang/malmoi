import type { Heading, Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

/**
 * **파서는 mdast 한 벌이다** — 게이트·목차·렌더러가 같은 트리를 본다. 코드 펜스·인라인 코드 안의
 * `{#id}`·`**x**`·`[a](b)`는 여기서 코드 노드가 되어 원리적으로 안 잡힌다(정규식으로 훑으면 잡힌다).
 *
 * ⚠️ `parse`만 부르고 `run`은 부르지 않는다 — remark-gfm은 micromark 확장이라 파싱 단계에서 이미 걸린다.
 */
const processor = unified().use(remarkParse).use(remarkGfm);

export function parseMd(text: string): Root {
  return processor.parse(text);
}

export type GuideErrorCode =
  | "anchor-id"
  | "summary-item"
  | "summary-path"
  | "summary-reserved"
  | "summary-duplicate-path"
  | "summary-duplicate-slug"
  | "table-header";

export class GuideError extends Error {
  constructor(
    readonly code: GuideErrorCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "GuideError";
  }
}

/** 이 안의 자식은 한 문장으로 잇는다 — 나머지(목록·표·인용·루트)는 줄로 가른다. */
const INLINE_PARENTS = new Set(["paragraph", "heading", "emphasis", "strong", "delete", "link", "linkReference", "tableCell"]);

/**
 * 노드의 보이는 텍스트. ⚠️ **블록 사이를 줄로 가르는 것이 요지다** — 표 셀이 붙으면 `Projects10`이 되어
 * `\b10\b` 같은 상수 대조가 조용히 빗나간다. 이미지 alt·raw HTML은 본문이 아니라 뺀다.
 *
 * `code`를 끄면 인라인 코드·코드 블록을 뺀다 — 화면 문장만 셀 때(용어 게이트). 식별자는 코드로 쓴다.
 */
export function toText(node: Nodes, code = true): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "inlineCode":
    case "code":
      return code ? node.value : "";
    case "break":
      return " ";
    default:
      if (!("children" in node)) return "";
      return (node.children as Nodes[]).map((child) => toText(child, code)).join(INLINE_PARENTS.has(node.type) ? "" : "\n");
  }
}

const MARKER = /\s*\{#([^{}]*)\}\s*$/;
const ANCHOR_ID = /^[a-z0-9-]+$/;

/**
 * `"Add the workflow {#workflow}"` → `{ text, id }`. 표식이 없으면 `id: null`, 문자 집합(`[a-z0-9-]`) 밖이면 던진다 —
 * 대문자·밑줄을 조용히 고쳐 쓰면 옛 링크와 새 링크가 갈린다.
 */
export function parseHeadingAnchor(text: string): { text: string; id: string | null } {
  const match = MARKER.exec(text);
  if (!match) return { text: text.trim(), id: null };
  const id = match[1] ?? "";
  if (!ANCHOR_ID.test(id)) throw new GuideError("anchor-id", text);
  return { text: text.slice(0, match.index).trim(), id };
}

/**
 * 끝의 `{#…}` 표식을 뗀 글자 — id를 검증하지 않는다. 코드를 뺀 텍스트(`toText(…, false)`)처럼 표식이
 * 코드일 수 없는 자리에서 쓴다. 노드가 있으면 `headingAnchor`다.
 */
export function stripHeadingMarker(text: string): string {
  const match = MARKER.exec(text);
  return (match ? text.slice(0, match.index) : text).trim();
}

/**
 * 헤딩 노드의 `{ text, id }`. ⚠️ **표식은 마지막 자식이 글자 노드일 때만 찾는다** — `` ## Anchors `{#id}` ``처럼
 * 표식 문법을 코드로 설명하는 헤딩을 앵커로 읽으면 안 된다(`toText`는 인라인 코드 값을 싣는다).
 */
export function headingAnchor(node: Heading): { text: string; id: string | null } {
  const last = node.children[node.children.length - 1];
  if (last?.type !== "text" || !MARKER.test(last.value)) return { text: toText(node).trim(), id: null };
  return parseHeadingAnchor(toText(node));
}

export type HeadingInfo = { depth: Heading["depth"]; text: string; id: string | null; node: Heading };

/** 문서의 모든 헤딩(문서 순). 펜스 속 `## …`는 `code` 노드라 여기 오지 않는다. */
export function headings(tree: Root): HeadingInfo[] {
  const out: HeadingInfo[] = [];
  visit(tree, "heading", (node) => {
    out.push({ depth: node.depth, ...headingAnchor(node), node });
  });
  return out;
}
