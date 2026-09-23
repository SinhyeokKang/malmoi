import { createHash } from "node:crypto";

import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DocBlock, DocSection } from "@/components/public-doc";

/**
 * 방침 본문 → 비교용 텍스트와 해시 (privacy design §2.2 (C)). 본문 해시가 바뀌면 개정 이력에 행을 하나 더
 * 쓰게 해서 **시행일 갱신을 잊는 탈출구**를 닫는 게이트의 재료다.
 *
 * ⚠️ **jsdom을 부르지 않는다** — `renderToStaticMarkup` + 태그 제거로 node에서 닫는다. `// @vitest-environment
 * jsdom`은 파일 단위 지시자라 같은 파일의 다른 검사까지 끌려간다. `String(node)`는 `[object Object]`를 준다.
 * ⚠️ 서버·테스트 전용이다(`node:crypto`) — 화면이 import하지 않는다.
 */

function blockNodes(block: DocBlock) {
  if ("p" in block) return [block.p];
  if ("ul" in block) return [...block.ul];
  return [...block.table.head, ...block.table.rows.flat()];
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&nbsp;": " " };

export function docText(sections: readonly DocSection[]): string {
  const parts: string[] = [];
  for (const section of sections) {
    parts.push(section.heading);
    for (const block of section.blocks) {
      // 조각마다 따로 렌더한다 — 태그를 지우면 인접한 두 문단이 붙어 한 낱말이 되는 것을 공백으로 막는다.
      for (const node of blockNodes(block)) parts.push(renderToStaticMarkup(createElement(Fragment, null, node)));
    }
  }
  return parts
    .join(" ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#x27|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

export function docDigest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
