import { describe, expect, it } from "vitest";

import { loadSource, loadSummary } from "@/lib/guide/load";
import { flattenNav, type NavNode } from "@/lib/guide/summary";
import { GITHUB_REPO_URL } from "@/lib/links";
import { en } from "@/messages/en";

import { absoluteGuideLinks, llmsFull, llmsIndex } from "../llms";

/**
 * **llms.txt 둘** (seo-geo T4). 형식은 fixture로 정확한 문자열을 고정하고, 실물 원고로는 파생값만 단언한다 — 원고가 바뀌어도
 * 깨지지 않게.
 */
const nav: NavNode[] = [
  { title: "Malmoi", file: "README.md", slug: [], children: [] },
  {
    title: "Set [up] & *go*",
    file: "setup/README.md",
    slug: ["setup"],
    children: [{ title: "Add the workflow", file: "setup/workflow.md", slug: ["setup", "workflow"], children: [] }],
  },
];

describe("llmsIndex", () => {
  it("llmstxt.org 형 — 요약 없는 항목은 `: …` 없이 끝나고 끝 개행은 하나다", () => {
    const leads = new Map<string, string | null>([
      ["README.md", "Start here."],
      ["setup/README.md", null],
      ["setup/workflow.md", "Add the action."],
    ]);
    expect(llmsIndex(nav, leads)).toBe(
      [
        "# Malmoi",
        "",
        `> ${en.landing.hero.body}`,
        "",
        "Malmoi currently has no paid plans and is open source under the MIT License. It works with GitHub repositories and supports external AI agents over MCP. It does not provide translation memory, built-in machine or AI translation, ICU plural or select syntax, approval workflows, fine-grained permissions, real-time co-editing, in-context editing, screenshot attachments, or translator notes.",
        "",
        "## Overview",
        "",
        "- [Malmoi](https://mal-moi.com/docs): Start here.",
        "",
        "## Set [up] & *go*",
        "",
        "- [Set \\[up\\] & *go*](https://mal-moi.com/docs/setup)",
        "- [Add the workflow](https://mal-moi.com/docs/setup/workflow): Add the action.",
        "",
        "## Optional",
        "",
        "- [Full documentation](https://mal-moi.com/llms-full.txt)",
        "- [Changelog](https://mal-moi.com/changelog)",
        "- [Privacy](https://mal-moi.com/privacy)",
        `- [GitHub](${GITHUB_REPO_URL})`,
        "",
      ].join("\n"),
    );
  });

  it("여러 줄 도입 문단은 한 줄 요약이 된다 — soft break가 목록 항목을 끊지 않는다", () => {
    const leads = new Map<string, string | null>([["setup/workflow.md", "Add the\n  generated   workflow."]]);
    expect(llmsIndex(nav, leads)).toContain("- [Add the workflow](https://mal-moi.com/docs/setup/workflow): Add the generated workflow.\n");
  });

  it("실물 SUMMARY — 링크 수가 항목 수이고 두 번 생성해도 바이트가 같다", () => {
    const real = loadSummary("en");
    const flat = flattenNav(real);
    const leads = new Map(flat.map((item) => [item.file, `lead of ${item.file}`]));
    const once = llmsIndex(real, leads);
    expect(once.match(/^- \[[^\n]+\]\(https:\/\/mal-moi\.com\/docs/gm)).toHaveLength(flat.length);
    expect(llmsIndex(real, leads)).toBe(once);
  });
});

describe("llmsFull", () => {
  it("항목마다 제목 · Source 줄 · 원고의 문서 링크만 절대 공개 URL로 바꾼다", () => {
    const flat = flattenNav(nav);
    const sources = new Map([
      [
        "README.md",
        [
          "# Malmoi",
          "",
          "See [setup](setup/README.md), [FAQ](faq.md#pricing), and [the overview](README.md#overview).",
          "Reference [formats][format docs] and keep [encoded (external)](https://example.com/a%20b_(c)).",
          "",
          "[format docs]: reference/formats.md#formats \"Formats (reference)\"",
          "",
          "![Encoded image](/guide/a_(b)%20c.webp)",
          "",
          "`[inline code](setup/README.md)`",
          "",
          "```md",
          "[fenced code](setup/README.md)",
          "```",
          "",
        ].join("\n"),
      ],
      ["setup/README.md", "# Set up\n\n## Steps {#steps}\n"],
      ["setup/workflow.md", "# Add the workflow\n"],
    ]);
    expect(llmsFull(flat, sources)).toBe(
      [
        "# Malmoi",
        "Source: https://mal-moi.com/docs",
        "",
        "# Malmoi",
        "",
        "See [setup](https://mal-moi.com/docs/setup), [FAQ](https://mal-moi.com/docs/faq#pricing), and [the overview](https://mal-moi.com/docs#overview).",
        "Reference [formats][format docs] and keep [encoded (external)](https://example.com/a%20b_(c)).",
        "",
        "[format docs]: https://mal-moi.com/docs/reference/formats#formats \"Formats (reference)\"",
        "",
        "![Encoded image](/guide/a_(b)%20c.webp)",
        "",
        "`[inline code](setup/README.md)`",
        "",
        "```md",
        "[fenced code](setup/README.md)",
        "```",
        "",
        "---",
        "",
        "# Set [up] & *go*",
        "Source: https://mal-moi.com/docs/setup",
        "",
        "# Set up",
        "",
        "## Steps {#steps}",
        "",
        "---",
        "",
        "# Add the workflow",
        "Source: https://mal-moi.com/docs/setup/workflow",
        "",
        "# Add the workflow",
        "",
      ].join("\n"),
    );
  });

  it("escaped definition label을 보존하고 실제 닫는 괄호 뒤 destination만 바꾼다", () => {
    const source = [
      "Reference [odd][foo\\]:bar] and [even][pair\\\\].",
      "",
      '[foo\\]:bar]: setup/README.md "Odd title"',
      "[pair\\\\]: setup/workflow.md  'Even title'",
      "",
    ].join("\n");

    expect(llmsFull(flattenNav(nav).slice(0, 1), new Map([["README.md", source]]))).toBe(
      [
        "# Malmoi",
        "Source: https://mal-moi.com/docs",
        "",
        "Reference [odd][foo\\]:bar] and [even][pair\\\\].",
        "",
        '[foo\\]:bar]: https://mal-moi.com/docs/setup "Odd title"',
        "[pair\\\\]: https://mal-moi.com/docs/setup/workflow  'Even title'",
        "",
      ].join("\n"),
    );
  });

  it("빈 현재 문서 destination을 그 자리의 절대 URL로 채우고 주변 바이트를 보존한다", () => {
    const source = "Before [same]() / [spaced](   ) / [angled](<>  \"Current title\") after.\n";

    expect(llmsFull(flattenNav(nav).slice(0, 1), new Map([["README.md", source]]))).toBe(
      [
        "# Malmoi",
        "Source: https://mal-moi.com/docs",
        "",
        'Before [same](https://mal-moi.com/docs) / [spaced](   https://mal-moi.com/docs) / [angled](<https://mal-moi.com/docs>  "Current title") after.',
        "",
      ].join("\n"),
    );
  });

  it("실물 원고 — Source 줄 수가 항목 수이고 두 번 생성해도 바이트가 같다", () => {
    const flat = flattenNav(loadSummary("en"));
    const sources = new Map(flat.map((item) => [item.file, loadSource("en", item.file)]));
    const once = llmsFull(flat, sources);
    expect(once.match(/^Source: https:\/\/mal-moi\.com\/docs/gm)).toHaveLength(flat.length);
    expect(llmsFull(flat, sources)).toBe(once);
    expect(once.endsWith("\n") && !once.endsWith("\n\n")).toBe(true);
  });
});

/**
 * **origin 인자** (mcp-docs T1) — MCP `read_docs`가 설치 origin으로 같은 변환을 쓴다. 바뀌는 것은 내부 문서 destination의 앞부분뿐이고
 * 외부 링크·코드·이미지 바이트는 그대로다. `llmsFull`은 `SITE_ORIGIN`을 넘긴다(위 fixture 정확 문자열이 그 바이트를 고정한다).
 */
describe("absoluteGuideLinks", () => {
  const source = [
    "See [setup](setup/README.md) and [FAQ](faq.md#pricing).",
    "Keep [external](https://example.com/a) and ![shot](/guide/x.webp).",
    "Reference [formats][fmt].",
    "",
    "[fmt]: reference/formats.md#formats",
    "",
    "```md",
    "[fenced](setup/README.md)",
    "```",
    "",
  ].join("\n");
  const expected = (prefix: string) => [
    `See [setup](${prefix}/docs/setup) and [FAQ](${prefix}/docs/faq#pricing).`,
    "Keep [external](https://example.com/a) and ![shot](/guide/x.webp).",
    "Reference [formats][fmt].",
    "",
    `[fmt]: ${prefix}/docs/reference/formats#formats`,
    "",
    "```md",
    "[fenced](setup/README.md)",
    "```",
    "",
  ].join("\n");

  it.each([
    ["SITE_ORIGIN", "https://mal-moi.com"],
    ["셀프 호스팅 origin", "https://i18n.example.org"],
  ])("%s를 주면 내부 링크·참조 정의만 그 origin의 절대 URL이 된다", (_, origin) => {
    expect(absoluteGuideLinks(source, "README.md", origin)).toBe(expected(origin));
  });

  it("origin이 null이면 앱 경로 그대로다", () => {
    expect(absoluteGuideLinks(source, "README.md", null)).toBe(expected(""));
  });
});
