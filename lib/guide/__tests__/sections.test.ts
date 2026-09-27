import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GuideError, parseMd } from "../parse";
import { leadParagraph, parseMdTable, sectionByAnchor } from "../sections";

const fixture = (name: string) => parseMd(readFileSync(new URL(`./fixtures/collect/${name}`, import.meta.url), "utf8"));

describe("sectionByAnchor — 앵커 헤딩부터 다음 같은 급 헤딩 전까지", () => {
  it("다음 같은 급 헤딩에서 멈추고, 하위 헤딩은 싣는다", () => {
    const text = sectionByAnchor(fixture("sections.md"), "projects");
    expect(text).toContain("Projects");
    expect(text).toContain("You can own 10 projects.");
    expect(text).toContain("Slugs are at most 40 characters.");
    expect(text).not.toContain("Up to 20 members.");
  });

  it("하위 헤딩 절은 그 위 급 헤딩에서도 멈춘다", () => {
    const text = sectionByAnchor(fixture("sections.md"), "detail");
    expect(text).toContain("40 characters");
    expect(text).not.toContain("members");
  });

  it("마지막 절은 문서 끝까지다 — 표 셀도 따로 선다", () => {
    const text = sectionByAnchor(fixture("sections.md"), "members") ?? "";
    expect(text).toContain("Up to 20 members.");
    expect(text).toMatch(/\b5\b/);
  });

  it("없는 앵커는 null이다", () => {
    expect(sectionByAnchor(fixture("sections.md"), "missing")).toBeNull();
  });

  it("제목의 `{#id}` 표식은 텍스트에 싣지 않는다", () => {
    const text = sectionByAnchor(fixture("sections.md"), "projects") ?? "";
    expect(text.startsWith("Projects\n")).toBe(true);
    expect(text).not.toContain("{#");
  });
});

describe("parseMdTable — 앵커 절의 첫 표 → 행 배열", () => {
  it("머리 행이 키이고 인라인 코드는 값이다", () => {
    expect(parseMdTable(fixture("tables.md"), "shots")).toEqual([
      { Asset: "/guide/publish.webp", Source: "components/publish.tsx", SHA: "abc123" },
      { Asset: "/guide/home.webp", Source: "app/page.tsx", SHA: "" },
    ]);
  });

  it("다른 절의 표를 읽는다", () => {
    expect(parseMdTable(fixture("tables.md"), "masking")).toEqual([{ Original: "SinhyeokKang", Replacement: "acme" }]);
  });

  it("절 안에 표가 없으면 null이다 — 다음 절의 표로 넘어가지 않는다", () => {
    expect(parseMdTable(fixture("tables.md"), "empty")).toBeNull();
  });

  it("없는 앵커는 null이다", () => {
    expect(parseMdTable(fixture("tables.md"), "missing")).toBeNull();
  });

  it("행 객체는 프로토타입이 없다 — 머리 셀이 `__proto__`여도 own property다", () => {
    const rows = parseMdTable(parseMd("## T {#t}\n\n| `__proto__` | b |\n|---|---|\n| x | y |\n"), "t");
    expect(Object.hasOwn(rows![0]!, "__proto__")).toBe(true);
    expect(rows![0]!["__proto__"]).toBe("x");
  });

  it("머리 셀이 겹치면 오류다 — 열 하나가 조용히 사라지지 않는다", () => {
    expect.assertions(2);
    try {
      parseMdTable(parseMd("## T {#t}\n\n| a | a |\n|---|---|\n| x | y |\n"), "t");
    } catch (error) {
      expect(error).toBeInstanceOf(GuideError);
      expect((error as GuideError).code).toBe("table-header");
    }
  });

  it("빠진 셀은 빈 문자열이다", () => {
    expect(parseMdTable(parseMd("## T {#t}\n\n| a | b |\n|---|---|\n| x |\n"), "t")).toEqual([{ a: "x", b: "" }]);
  });
});

describe("leadParagraph — H1 바로 다음 첫 문단", () => {
  it("도입 문단의 텍스트", () => {
    expect(leadParagraph(parseMd("# Title\n\nAdd **one** file to `main`.\n\nSecond paragraph."))).toBe("Add one file to main.");
  });

  it.each([
    ["이미지가 먼저", "# Title\n\n![Screen](/guide/x.webp)\n\nText."],
    ["이미지로 시작하는 문단", "# Title\n\n![Screen](/guide/x.webp) then text.\n"],
    ["링크 걸린 이미지로 시작하는 문단", "# Title\n\n[![Screen](/guide/x.webp)](setup/workflow.md) then text.\n"],
    ["인용이 먼저", "# Title\n\n> Note\n\nText."],
    ["코드가 먼저", "# Title\n\n```\ncode\n```\n\nText."],
    ["헤딩이 먼저", "# Title\n\n## Section {#s}\n\nText."],
    ["H1 없음", "Just text."],
    ["도입 없음", "# Title\n"],
  ])("%s → null", (_, text) => {
    expect(leadParagraph(parseMd(text))).toBeNull();
  });
});
