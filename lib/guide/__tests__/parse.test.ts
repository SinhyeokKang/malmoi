import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GuideError, headings, parseHeadingAnchor, parseMd, toText } from "../parse";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseMd — 게이트와 렌더러가 같은 mdast를 본다", () => {
  it("GFM 표를 table 노드로 읽는다 — remark-gfm이 parse 단계에 붙었다", () => {
    const tree = parseMd("| a | b |\n|---|---|\n| 1 | 2 |\n");
    expect(tree.children[0]?.type).toBe("table");
  });

  it("toText가 인라인 코드 값을 싣고, 블록 사이는 줄로 가른다", () => {
    const tree = parseMd("Put `PUSH_TOKEN` in secrets.\n\n| Limit | Value |\n|---|---|\n| Projects | 10 |\n");
    const text = toText(tree);
    expect(text).toContain("Put PUSH_TOKEN in secrets.");
    // 셀이 붙어 `Projects10`이 되면 `\b10\b` 대조가 깨진다
    expect(text).toMatch(/\b10\b/);
  });

  it("toText(…, false)는 코드를 뺀다 — 화면 문장만 셀 때", () => {
    const tree = parseMd("Allow `acme/malmoi-i18n-push` here.\n\n```yaml\npush: yes\n```\n");
    expect(toText(tree, false)).not.toMatch(/push/);
  });
});

describe("parseHeadingAnchor — `{#id}`는 데이터다", () => {
  it("표식을 떼고 id를 낸다", () => {
    expect(parseHeadingAnchor("Add the workflow {#workflow}")).toEqual({ text: "Add the workflow", id: "workflow" });
    expect(parseHeadingAnchor("Limits {#limits-2}")).toEqual({ text: "Limits", id: "limits-2" });
  });

  it("표식이 없으면 id는 null이다", () => {
    expect(parseHeadingAnchor("Add the workflow")).toEqual({ text: "Add the workflow", id: null });
  });

  it.each(["Bad {#Workflow}", "Bad {#work_flow}", "Bad {#}", "Bad {#a b}", "Bad {#한글}"])("id 문자 집합 밖은 오류다 — %s", (text) => {
    expect(() => parseHeadingAnchor(text)).toThrow(GuideError);
  });

  it("오류가 코드를 든다", () => {
    try {
      parseHeadingAnchor("Bad {#X}");
    } catch (error) {
      expect(error).toBeInstanceOf(GuideError);
      expect((error as GuideError).code).toBe("anchor-id");
    }
  });
});

describe("headings — 코드 펜스 안의 `{#id}`는 헤딩이 아니다", () => {
  it("펜스 속 `## … {#fenced}`를 세지 않는다", () => {
    const found = headings(parseMd(fixture("summary/code-fence-heading.md")));
    expect(found.map(({ depth, text, id }) => ({ depth, text, id }))).toEqual([
      { depth: 1, text: "Workflow", id: "top" },
      { depth: 2, text: "Real", id: "real" },
    ]);
  });

  it("헤딩 속 인라인 코드도 텍스트에 든다", () => {
    expect(headings(parseMd("## The `PUSH_TOKEN` secret {#token}"))[0]).toMatchObject({ text: "The PUSH_TOKEN secret", id: "token" });
  });
});

describe("headingAnchor — 표식은 헤딩 끝의 글자에서만", () => {
  it("인라인 코드로 쓴 `{#id}`는 앵커가 아니다 — 표식 문법을 설명하는 헤딩", () => {
    const [heading] = headings(parseMd("## Anchors look like `{#id}`"));
    expect(heading).toMatchObject({ text: "Anchors look like {#id}", id: null });
  });

  it("코드 뒤에 붙은 표식은 앵커다", () => {
    const [heading] = headings(parseMd("## The `PUSH_TOKEN` {#token}"));
    expect(heading).toMatchObject({ text: "The PUSH_TOKEN", id: "token" });
  });

  it("같은 규칙이 절 자르기에도 걸린다", async () => {
    const { sectionByAnchor } = await import("../sections");
    expect(sectionByAnchor(parseMd("## Anchors `{#id}`\n\nbody"), "id")).toBeNull();
  });
});
