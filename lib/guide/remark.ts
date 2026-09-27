import type { Root } from "mdast";
import { visit } from "unist-util-visit";

import { resolveDocLink } from "./collect";
import { headingAnchor } from "./parse";
import { tableLabel } from "./toc";

/**
 * 끝 표식 — `parse.ts`의 `MARKER`와 같은 모양. ⚠️ **글자 노드 하나에서만 뗀다** — `stripHeadingMarker`는 전체를
 * trim하므로 `Add **the** workflow {#x}`의 마지막 노드(` workflow {#x}`)에 쓰면 앞 공백까지 사라진다.
 */
const TRAILING_MARKER = /\s*\{#[^{}]*\}\s*$/;
const TITLE = /(?:^|\s)title="([^"]+)"/;

/** 펜스 메타의 `title="…"` → 코드 블록 바의 파일명. 없으면 null — 바 없이 Copy만 뜬다(시안 1b). */
export function codeFilename(meta: string | null | undefined): string | null {
  return (meta ? TITLE.exec(meta)?.[1] : undefined) ?? null;
}

/**
 * 렌더 직전 mdast 손질 — 렌더러가 **게이트와 같은 트리**(`parseMd`)를 받아 이것만 얹는다.
 *
 * - 헤딩 `{#id}` → `id` 속성, 글자에서 표식 제거. H2는 `tabIndex=-1`(해시 착지·목차 클릭의 포커스 대상 — privacy 선례).
 * - 상대 `.md` 링크 → `/docs/<slug>#anchor`. 외부는 `target=_blank rel=noreferrer`. 해소되지 않는 링크는 그대로 둔다 —
 *   게이트가 red를 내는 자리이고, 여기서 고쳐 쓰면 원고의 잘못이 가려진다.
 * - 표 → `data-label`(`tableLabel`) · 코드 → `data-filename`(`codeFilename`).
 *
 * ⚠️ **트리를 바꾼다** — 로더의 `cache`가 든 트리를 넘기지 말고 사본을 넘긴다.
 */
export function remarkGuide({ file }: { file: string }) {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type === "heading") {
        const { id } = headingAnchor(node);
        if (id === null) return;
        const last = node.children[node.children.length - 1];
        if (last?.type === "text") last.value = last.value.replace(TRAILING_MARKER, "");
        node.data = { ...node.data, hProperties: node.depth === 2 ? { id, tabIndex: -1 } : { id } };
      } else if (node.type === "link") {
        const link = resolveDocLink(file, node.url);
        if (link.kind === "doc") node.url = link.href;
        else if (link.kind === "external") node.data = { ...node.data, hProperties: { target: "_blank", rel: ["noreferrer"] } };
      } else if (node.type === "table") {
        const label = tableLabel(tree, node);
        if (label !== null) node.data = { ...node.data, hProperties: { dataLabel: label } };
      } else if (node.type === "code") {
        const filename = codeFilename(node.meta);
        if (filename !== null) node.data = { ...node.data, hProperties: { dataFilename: filename } };
      }
    });
  };
}
