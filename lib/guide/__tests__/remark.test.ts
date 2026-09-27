import type { Code, Heading, Link, Root, Table } from "mdast";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";

import { parseMd, toText } from "../parse";
import { codeFilename, remarkGuide } from "../remark";

const run = (md: string, file = "setup/workflow.md"): Root => unified().use(remarkGuide, { file }).runSync(parseMd(md)) as Root;

/** `hProperties`의 타입 확장은 `mdast-util-to-hast`가 든다 — 전이 의존성이라 import할 수 없어 여기서 좁힌다. */
const props = (node: { data?: unknown }) => (node.data as { hProperties?: unknown } | undefined)?.hProperties;

const first = <T extends Root["children"][number]["type"]>(tree: Root, type: T) => {
  let found: unknown;
  visit(tree, type, (node) => {
    found ??= node;
  });
  return found;
};

describe("remarkGuide — 헤딩 `{#id}`", () => {
  it("표식을 `id` 속성으로 옮기고 글자에서 뗀다", () => {
    const tree = run("# T\n\n## Add the workflow {#workflow}\n");
    const [h1, h2] = tree.children as Heading[];
    expect(props(h1!)).toBeUndefined();
    expect(props(h2!)).toMatchObject({ id: "workflow" });
    expect(toText(h2!)).toBe("Add the workflow");
  });

  it("H2는 `tabIndex=-1`을 든다 — 해시 착지·목차 클릭이 포커스를 옮긴다", () => {
    const h2 = run("# T\n\n## A {#a}\n\n### B {#b}\n").children[1] as Heading;
    const h3 = run("# T\n\n## A {#a}\n\n### B {#b}\n").children[2] as Heading;
    expect(props(h2)).toMatchObject({ id: "a", tabIndex: -1 });
    expect(props(h3)).toEqual({ id: "b" });
  });

  it("표식을 코드로 설명하는 헤딩은 건드리지 않는다", () => {
    const h2 = run("# T\n\n## Anchors `{#id}`\n").children[1] as Heading;
    expect(props(h2)).toBeUndefined();
    expect(toText(h2)).toBe("Anchors {#id}");
  });

});

describe("remarkGuide — 링크", () => {
  it("상대 `.md` 링크를 앱 경로로 바꾼다", () => {
    const link = first(run("[Formats](../reference/formats.md#formats)"), "link") as Link;
    expect(link.url).toBe("/docs/reference/formats#formats");
  });

  it("같은 페이지 앵커도 앱 경로로 — 해시만 남기면 페이지가 바뀐 뒤에도 옛 경로를 가리키지 않는다", () => {
    const link = first(run("[Up](#workflow)"), "link") as Link;
    expect(link.url).toBe("/docs/setup/workflow#workflow");
  });

  it("외부 URL은 그대로 두고 새 탭 표시를 단다", () => {
    const link = first(run("[GitHub](https://github.com)"), "link") as Link;
    expect(link.url).toBe("https://github.com");
    expect(props(link)).toEqual({ target: "_blank", rel: ["noreferrer"] });
  });

  it("해소되지 않는 링크는 건드리지 않는다 — 게이트(`pnpm test`)가 red를 낸다", () => {
    const link = first(run("[Bad](/docs/absolute)"), "link") as Link;
    expect(link.url).toBe("/docs/absolute");
    expect(props(link)).toBeUndefined();
  });
});

describe("remarkGuide — 표 이름", () => {
  it("가장 가까운 상위 헤딩을 `data-label`로 싣는다", () => {
    const table = first(run("# T\n\n## Limits {#limits}\n\n| a |\n|---|\n| 1 |\n"), "table") as Table;
    expect(props(table)).toEqual({ dataLabel: "Limits" });
  });
});

describe("codeFilename — 펜스 메타의 파일명", () => {
  const code = (md: string) => first(parseMd(md), "code") as Code;

  it('`title="…"`을 읽는다', () => {
    expect(codeFilename(code('```yaml title=".github/workflows/malmoi-i18n.yml"\na: 1\n```').meta)).toBe(".github/workflows/malmoi-i18n.yml");
  });

  it("메타가 없거나 title이 없으면 null — 바 없이 Copy만 뜬다", () => {
    expect(codeFilename(code("```yaml\na: 1\n```").meta)).toBeNull();
    expect(codeFilename(code("```yaml other\na: 1\n```").meta)).toBeNull();
    expect(codeFilename(undefined)).toBeNull();
  });

  it("remarkGuide가 코드 요소에 `data-filename`을 싣는다", () => {
    const node = first(run('```yaml title="x.yml"\na: 1\n```'), "code") as Code;
    expect(props(node)).toEqual({ dataFilename: "x.yml" });
  });
});
