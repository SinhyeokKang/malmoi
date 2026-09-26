import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseMd } from "../parse";
import { renderProblems, summaryDepth } from "../rules";
import { parseSummary } from "../summary";

import { servedGuideFiles } from "./helpers/served";

const kinds = (md: string) => renderProblems(parseMd(md)).map((problem) => problem.kind);

describe("renderProblems — 렌더러가 약속하지 않는 원고 문법", () => {
  it("깨끗한 원고는 문제 0", () => {
    expect(kinds("# T\n\nText with **bold** and `code`.\n\n![Alt](/guide/a.webp)\n\n- ![Alt](/guide/b.webp)\n")).toEqual([]);
  });

  it("raw HTML은 red다 — react-markdown이 버리지 않고 글자로 내보낸다(`<b>`가 화면에 그대로 선다)", () => {
    // 인라인 HTML은 여는 태그·닫는 태그가 노드 둘이다
    expect(kinds("# T\n\n<b>raw</b>\n")).toEqual(["html", "html"]);
    expect(kinds("# T\n\n<div>\nblock\n</div>\n")).toEqual(["html"]);
    expect(kinds("# T\n\nInline <kbd>x</kbd> tag.\n")).toContain("html");
    expect(kinds("# T\n\n<!-- note -->\n")).toEqual(["html"]);
  });

  it("코드 속 `<b>`는 HTML이 아니다", () => {
    expect(kinds("# T\n\n`<b>` and\n\n```html\n<b>x</b>\n```\n")).toEqual([]);
  });

  it("이미지는 문단에 혼자 선다 — 글자와 섞이면 `<p>` 안 `<figure>`가 된다", () => {
    expect(kinds("# T\n\nSee ![Alt](/guide/a.webp) here.\n")).toEqual(["image-inline"]);
    expect(kinds("# T\n\n![A](/guide/a.webp) ![B](/guide/b.webp)\n")).toEqual(["image-inline", "image-inline"]);
    expect(kinds("# T\n\n| a |\n|---|\n| ![A](/guide/a.webp) |\n")).toEqual(["image-inline"]);
  });

  it("링크로 감싼 이미지는 red다 — `<a>` 안 `<figure>`", () => {
    expect(kinds("# T\n\n[![Alt](/guide/a.webp)](https://example.com)\n")).toEqual(["image-link"]);
  });

  it("GFM 각주는 red다 — 렌더러가 각주 절·되돌림 링크를 그리지 않는다", () => {
    expect(kinds("# T\n\nText[^1].\n\n[^1]: Note.\n")).toEqual(["footnote", "footnote"]);
  });

  it("줄 번호를 든다", () => {
    expect(renderProblems(parseMd("# T\n\n<b>x</b>\n"))[0]?.line).toBe(3);
  });
});

describe("summaryDepth — 내비는 두 단만 그린다", () => {
  it("장 하나 + 하위 = 2, 셋째 단 = 3", () => {
    expect(summaryDepth(parseSummary(parseMd("- [A](README.md)\n  - [B](b.md)\n")))).toBe(2);
    expect(summaryDepth(parseSummary(parseMd("- [A](README.md)\n  - [B](b/README.md)\n    - [C](b/c.md)\n")))).toBe(3);
    expect(summaryDepth([])).toBe(0);
  });
});

describe("서빙 원고 — 렌더 규칙", () => {
  const guide = join(process.cwd(), "guide");
  const files = servedGuideFiles(guide);

  it("원고를 실제로 읽었다", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("raw HTML · 섞인 이미지 · 링크 이미지 · 각주가 0이다", () => {
    const problems = files.flatMap((file) =>
      renderProblems(parseMd(readFileSync(join(guide, file), "utf8"))).map(({ kind, line }) => `${file}:${line ?? "?"} ${kind}`),
    );
    expect(problems).toEqual([]);
  });

  it("SUMMARY가 두 단을 넘지 않는다", () => {
    expect(summaryDepth(parseSummary(parseMd(readFileSync(join(guide, "SUMMARY.md"), "utf8"))))).toBeLessThanOrEqual(2);
  });
});
