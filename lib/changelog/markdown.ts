import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * 릴리스 본문 mdast 손질 — 렌더러가 remark 플러그인으로 얹는다. 본문은 `/merge` 5단계 ② 양식의 GitHub 원문이다.
 * ⚠️ **트리를 바꾼다.**
 */

/**
 * 본문의 최소 제목 깊이를 3으로 맞춘다 — 페이지 `h1` → 버전 `h2` 아래라 바닥이 늘 3이다. 사람이 넣은 `#`도 `h3`가
 * 되어 버전 제목과 급이 겹치지 않는다. `h6`에서 멈춘다.
 */
export function shiftHeadings(tree: Root): void {
  let min = Infinity;
  visit(tree, "heading", (node) => {
    min = Math.min(min, node.depth);
  });
  if (min === Infinity) return;
  const shift = 3 - min;
  visit(tree, "heading", (node) => {
    node.depth = Math.min(6, node.depth + shift) as 1 | 2 | 3 | 4 | 5 | 6;
  });
}

/**
 * 끝의 `**Full changelog:** <compare>` 줄 제거 — 그 역할은 항목 끝의 `View on GitHub`가 대신한다(compare가 없는
 * 1.0.0에도 선다). **마지막 문단만** 본다 — 중간의 같은 줄은 사람이 일부러 쓴 것이다.
 */
export function dropFullChangelog(tree: Root): void {
  const last = tree.children.at(-1);
  if (last?.type !== "paragraph") return;
  const first = last.children[0];
  if (first?.type !== "strong") return;
  const label = first.children[0];
  if (first.children.length === 1 && label?.type === "text" && label.value.trim() === "Full changelog:") tree.children.pop();
}

/**
 * 이미지 → alt 글자의 링크. `<img>`를 만들지 않아 CSP `img-src`(`lib/security-headers.ts`)와 `/privacy`의 전송처가
 * 그대로다 — 방문자 브라우저가 GitHub 첨부 호스트로 직접 요청하지 않는다. 참조형(`![x][ref]`)도 같은 이유로 바꾼다.
 */
export function imagesToLinks(tree: Root): void {
  visit(tree, (node, index, parent) => {
    if (parent === undefined || index === undefined) return;
    if (node.type === "image") {
      parent.children[index] = { type: "link", url: node.url, title: node.title, children: [{ type: "text", value: node.alt || node.url }] };
    } else if (node.type === "imageReference") {
      parent.children[index] = {
        type: "linkReference",
        identifier: node.identifier,
        label: node.label,
        referenceType: node.referenceType,
        children: [{ type: "text", value: node.alt || node.identifier }],
      };
    }
  });
}
