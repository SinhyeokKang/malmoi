import type { Root, Table } from "mdast";
import { visit } from "unist-util-visit";

import { headingAnchor, headings } from "./parse";

export type TocItem = { id: string; text: string };

/**
 * 목차 = **H2만, 평탄**(시안 1b). ⚠️ **둘 미만이면 빈 목록이다** — 항목 하나짜리 목차는 가리킬 곳이 없고,
 * 렌더러는 빈 목록이면 목차를 숨기고 열만 비운다. 표식 없는 H2는 가리킬 id가 없어 건너뛴다(구조 게이트가 red를 낸다).
 */
export function extractToc(tree: Root): TocItem[] {
  const items = headings(tree).flatMap(({ depth, text, id }) => (depth === 2 && id !== null ? [{ id, text }] : []));
  return items.length < 2 ? [] : items;
}

/**
 * 표의 접근 이름 = 문서 순으로 **가장 가까운 앞선 헤딩**(`DocTable`의 `label`). 한 페이지 안 중복 0은 게이트가 본다.
 * 헤딩보다 먼저 선 표·트리에 없는 표는 null — 이름을 지어내지 않는다.
 */
export function tableLabel(tree: Root, table: Table): string | null {
  let last: string | null = null;
  let label: string | null = null;
  visit(tree, (node) => {
    if (node.type === "heading") last = headingAnchor(node).text;
    else if (node === table) {
      label = last;
      return false;
    }
  });
  return label;
}
