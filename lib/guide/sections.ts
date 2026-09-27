import type { PhrasingContent, Root, RootContent, Table } from "mdast";

import { GuideError, headingAnchor, toText } from "./parse";

/**
 * 앵커 헤딩의 루트 위치부터 다음 같은(또는 윗) 급 헤딩 전까지의 노드. 원고의 헤딩은 루트에만 선다 —
 * 목록·인용 속 헤딩은 절을 나누지 않는다.
 */
function sectionNodes(tree: Root, id: string): RootContent[] | null {
  const start = tree.children.findIndex((node) => node.type === "heading" && headingAnchor(node).id === id);
  const heading = tree.children[start];
  if (heading?.type !== "heading") return null;
  const rest = tree.children.slice(start + 1);
  const end = rest.findIndex((node) => node.type === "heading" && node.depth <= heading.depth);
  return [heading, ...(end === -1 ? rest : rest.slice(0, end))];
}

/**
 * 절 텍스트 — 정본 상수 대조용(옛 `docs-content.test.tsx`의 `closest("section")` 대응). 제목을 포함하되
 * `{#id}` 표식은 뗀다 — 화면에 안 보이는 글자가 대조를 통과시키면 안 된다.
 */
export function sectionByAnchor(tree: Root, id: string): string | null {
  return sectionNodes(tree, id)?.map((node) => (node.type === "heading" ? headingAnchor(node).text : toText(node))).join("\n") ?? null;
}

/**
 * 앵커 절의 **첫 표** → 행 배열(머리 셀이 키). AUTHORING·SHOOTING의 표 셋(외부 라벨 허용 목록 · 에셋 매핑 ·
 * 마스킹)이 이 파서 하나를 쓴다. 절 안에 표가 없으면 null — 다음 절의 표로 넘어가지 않는다.
 *
 * 머리 셀은 원고가 정한 키라 행은 `Object.create(null)`이다.
 */
export function parseMdTable(tree: Root, headingId: string): Record<string, string>[] | null {
  const table = sectionNodes(tree, headingId)?.find((node): node is Table => node.type === "table");
  if (!table) return null;
  const [head, ...body] = table.children;
  const keys = head?.children.map((cell) => toText(cell).trim()) ?? [];
  // 겹친 머리 셀은 뒤 열이 앞 열을 덮어 한 열이 조용히 사라진다 — 표를 고치게 던진다
  const duplicate = keys.find((key, i) => keys.indexOf(key) !== i);
  if (duplicate !== undefined) throw new GuideError("table-header", `${headingId}: ${duplicate}`);
  return body.map((row) => {
    const out: Record<string, string> = Object.create(null);
    keys.forEach((key, i) => {
      const cell = row.children[i];
      out[key] = cell ? toText(cell).trim() : "";
    });
    return out;
  });
}

/**
 * **도입 문단** = H1 바로 다음 노드가 문단일 때 그 텍스트. 개요 카드·장 개요 행의 설명이 이 값이다.
 * 이미지·인용·코드가 먼저 오면 null — 설명 자리에 alt나 코드가 들어가면 안 된다.
 */
export function leadParagraph(tree: Root): string | null {
  const h1 = tree.children.findIndex((node) => node.type === "heading" && node.depth === 1);
  if (h1 === -1) return null;
  const next = tree.children[h1 + 1];
  if (next?.type !== "paragraph" || startsWithImage(next.children[0])) return null;
  const text = toText(next).trim();
  return text === "" ? null : text;
}

/** 이미지 또는 이미지를 감싼 링크(`[![x](…)](…)`)로 시작하는가. */
function startsWithImage(node: PhrasingContent | undefined): boolean {
  if (node?.type === "image" || node?.type === "imageReference") return true;
  return (node?.type === "link" || node?.type === "linkReference") && startsWithImage(node.children[0]);
}
