import type { Nodes, Root } from "mdast";
import { visit } from "unist-util-visit";

import type { NavNode } from "./summary";

export type RenderProblemKind = "html" | "image-inline" | "image-link" | "footnote";
export type RenderProblem = { kind: RenderProblemKind; line: number | null };

/** 공백뿐인 글자 노드 — 이미지 둘레의 줄바꿈은 "혼자"를 깨지 않는다. */
const blank = (node: Nodes) => node.type === "text" && node.value.trim() === "";

/**
 * 렌더러(`components/docs/guide-markdown.tsx`)가 **약속하지 않는 문법** — 게이트가 막아 렌더러가 그 경우를 모르게 둔다.
 *
 * - `html` — ⚠️ react-markdown은 raw HTML을 **버리지 않고 글자로** 낸다(`rehype-raw` 없음 · `skipHtml` 끔). `<b>`가 화면에 그대로 선다.
 * - `image-inline` — 이미지는 문단에 **혼자** 선다. 글자·다른 이미지와 섞이면 `<p>` 안 `<figure>`(잘못된 HTML → 하이드레이션 오류).
 * - `image-link` — 링크로 감싼 이미지는 `<a>` 안 `<figure>`다. 확대 보기도 없다(DESIGN §6.61).
 * - `footnote` — GFM 각주는 각주 절·되돌림 링크를 그릴 자리가 없다.
 */
export function renderProblems(tree: Root): RenderProblem[] {
  const out: RenderProblem[] = [];
  const push = (kind: RenderProblemKind, node: Nodes) => out.push({ kind, line: node.position?.start.line ?? null });
  // ⚠️ 부모 하나만 본다 — `unist-util-visit-parents`는 직접 의존성이 아니다(pnpm strict). 링크 안 강조 안 이미지는
  // 부모가 강조라 `image-inline`으로 잡힌다(어느 쪽이든 red다).
  visit(tree, (node, _index, parent) => {
    if (node.type === "html") push("html", node);
    else if (node.type === "footnoteReference" || node.type === "footnoteDefinition") push("footnote", node);
    else if (node.type === "image" || node.type === "imageReference") {
      if (parent?.type === "link" || parent?.type === "linkReference") push("image-link", node);
      else if (parent?.type !== "paragraph" || parent.children.filter((child) => !blank(child)).length !== 1) push("image-inline", node);
    }
  });
  return out;
}

/** SUMMARY의 단 수 — 내비(`app/docs/layout.tsx`)는 두 단만 그리므로 셋째 단은 조용히 빠진다. */
export function summaryDepth(nav: readonly NavNode[]): number {
  return nav.reduce((max, node) => Math.max(max, 1 + summaryDepth(node.children)), 0);
}
