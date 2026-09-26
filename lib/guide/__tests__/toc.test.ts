import type { Table } from "mdast";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";

import { parseMd } from "../parse";
import { extractToc, tableLabel } from "../toc";

const tables = (md: string) => {
  const tree = parseMd(md);
  const out: Table[] = [];
  visit(tree, "table", (node) => {
    out.push(node);
  });
  return { tree, tables: out };
};

describe("extractToc — 목차는 H2만, 평탄", () => {
  it("H2만 문서 순으로 — H1·H3는 싣지 않는다", () => {
    const tree = parseMd("# Title\n\n## First {#first}\n\n### Deep {#deep}\n\n## Second {#second}\n");
    expect(extractToc(tree)).toEqual([
      { id: "first", text: "First" },
      { id: "second", text: "Second" },
    ]);
  });

  it("H2가 둘 미만이면 빈 목록이다 — 목차를 숨기고 열만 비운다", () => {
    expect(extractToc(parseMd("# Title\n\n## Only {#only}\n"))).toEqual([]);
    expect(extractToc(parseMd("# Title\n\nNo sections.\n"))).toEqual([]);
  });

  it("표식 없는 H2는 건너뛴다 — 가리킬 id가 없다(구조 게이트가 따로 red를 낸다)", () => {
    const tree = parseMd("# T\n\n## A {#a}\n\n## Loose\n\n## B {#b}\n");
    expect(extractToc(tree).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("펜스 속 `## x {#x}`는 헤딩이 아니다", () => {
    const tree = parseMd("# T\n\n## A {#a}\n\n```md\n## Fake {#fake}\n```\n\n## B {#b}\n");
    expect(extractToc(tree).map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("tableLabel — 표의 접근 이름은 가장 가까운 상위 헤딩", () => {
  it("표 바로 위 헤딩의 글자 — `{#id}` 표식은 뗀다", () => {
    const { tree, tables: [first, second] } = tables(
      "# Limits\n\n## Projects {#projects}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n### Detail\n\nText.\n\n| c |\n|---|\n| 3 |\n",
    );
    expect(tableLabel(tree, first!)).toBe("Projects");
    expect(tableLabel(tree, second!)).toBe("Detail");
  });

  it("헤딩보다 먼저 선 표는 null — 이름을 지어내지 않는다", () => {
    const { tree, tables: [first] } = tables("| a |\n|---|\n| 1 |\n\n# Title\n");
    expect(tableLabel(tree, first!)).toBeNull();
  });

  it("목록 속 표도 문서 순으로 앞선 헤딩을 본다", () => {
    const { tree, tables: [first] } = tables("# Title\n\n## Steps {#steps}\n\n- item\n\n  | a |\n  |---|\n  | 1 |\n");
    expect(tableLabel(tree, first!)).toBe("Steps");
  });

  it("트리에 없는 표는 null이다", () => {
    const { tables: [foreign] } = tables("# X\n\n| a |\n|---|\n| 1 |\n");
    expect(tableLabel(parseMd("# Y\n"), foreign!)).toBeNull();
  });
});
