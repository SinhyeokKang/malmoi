import { describe, expect, it } from "vitest";

import { loadSource, loadSummary } from "@/lib/guide/load";
import { parseMd } from "@/lib/guide/parse";
import { flattenNav, type NavNode } from "@/lib/guide/summary";
import { docsSearchEntries } from "@/lib/search/docs-index";
import { absoluteGuideLinks } from "@/lib/seo/llms";
import { en } from "@/messages/en";
import { visit } from "unist-util-visit";

import { planDocsRead, sectionSlices } from "../docs";
import type { ToolOutcome } from "../result";

/**
 * **가이드 읽기** (mcp-docs T2·T3). 절 조각은 검색 색인(`docsSearchEntries`)과 같은 단위여야 검색 결과에 원고 조각을 붙일 수 있다 —
 * 그래서 실물 원고 전 페이지로 `(page, anchor)` 집합 동치를 잰다. 검색 순위는 fixture로 고정한다(`searchGroups(…).docs`와 대조하면
 * 구현이 그것을 부르므로 동어반복이다).
 */

const ORIGIN = "https://i18n.example.org";

const ok = (outcome: ToolOutcome) => {
  if (outcome.status !== "ok") throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  return outcome;
};

describe("sectionSlices", () => {
  it("도입부는 anchor null이고 H1만 뺀다 — H1 앞 노드도 도입부다", () => {
    const slices = sectionSlices("Before title.\n\n# Title\n\nLead paragraph.\n\n## First {#first}\n\nBody.\n");
    expect(slices).toEqual([
      { anchor: null, markdown: "Before title.\n\nLead paragraph." },
      { anchor: "first", markdown: "## First {#first}\n\nBody." },
    ]);
  });

  it("도입부가 비어도 조각이 선다", () => {
    expect(sectionSlices("# Title\n\n## First {#first}\n\nBody.\n")).toEqual([
      { anchor: null, markdown: "" },
      { anchor: "first", markdown: "## First {#first}\n\nBody." },
    ]);
  });

  it("id 없는 H2 절은 버리고 H3는 절을 나누지 않으며 코드 펜스 안의 `## `는 절이 아니다", () => {
    const source = [
      "# Title",
      "",
      "Intro.",
      "",
      "## Skipped",
      "",
      "Skipped body.",
      "",
      "## Kept {#kept}",
      "",
      "Kept body.",
      "",
      "### Child {#child}",
      "",
      "Child body.",
      "",
      "```md",
      "## Not a heading {#fake}",
      "```",
      "",
      "## Last {#last}",
      "",
      "  Last body.  ",
      "",
      "",
    ].join("\n");
    expect(sectionSlices(source)).toEqual([
      { anchor: null, markdown: "Intro." },
      { anchor: "kept", markdown: "## Kept {#kept}\n\nKept body.\n\n### Child {#child}\n\nChild body.\n\n```md\n## Not a heading {#fake}\n```" },
      { anchor: "last", markdown: "## Last {#last}\n\n  Last body." },
    ]);
  });

  describe("실물 guide/en", () => {
    const nav = loadSummary("en");
    const flat = flattenNav(nav);

    it("절 조각의 (page, anchor) 집합이 검색 색인과 같다", () => {
      const fromSlices = flat.flatMap(({ file, slug }) => sectionSlices(loadSource("en", file)).map(({ anchor }) => `${slug.join("/")}#${anchor ?? ""}`));
      const fromIndex = docsSearchEntries(nav, (file) => parseMd(loadSource("en", file))).map(({ page, anchor }) => `${page}#${anchor ?? ""}`);
      expect(fromSlices).toEqual(fromIndex);
    });

    it("참조식 링크·정의가 0건이다 — 절 조각에서 정의가 해석되지 않는다는 전제", () => {
      const found = flat.flatMap(({ file }) => {
        const hits: string[] = [];
        visit(parseMd(loadSource("en", file)), (node) => {
          if (node.type === "linkReference" || node.type === "definition") hits.push(`${file}:${node.position?.start.line ?? "?"}`);
        });
        return hits;
      });
      expect(found).toEqual([]);
    });
  });
});

describe("planDocsRead — 목차·페이지 (실물 guide/en)", () => {
  const nav = loadSummary("en");
  const flat = flattenNav(nav);
  const sources = new Map(flat.map((item) => [item.file, loadSource("en", item.file)]));

  it("목차는 SUMMARY 순서이고 sections에는 id 있는 H2만 있다", () => {
    const { data, summary } = ok(planDocsRead(nav, sources, {}, ORIGIN));
    const pages = data.pages as { page: string; title: string; url: string; sections: { anchor: string; title: string }[] }[];
    expect(pages.map((p) => p.page)).toEqual(flat.map((item) => item.slug.join("/")));
    expect(pages.map((p) => p.title)).toEqual(flat.map((item) => item.title));
    expect(pages[0]?.url).toBe(`${ORIGIN}/docs`);
    const entries = docsSearchEntries(nav, (file) => parseMd(sources.get(file) ?? ""));
    for (const page of pages) {
      expect(page.sections).toEqual(entries.filter((e) => e.page === page.page && e.anchor !== null).map((e) => ({ anchor: e.anchor, title: e.section })));
    }
    expect(summary).toBe(en.mcp.summary.guidePages(flat.length));
  });

  it("목차의 모든 page 값이 { page }로 되받혀지고 전문은 absoluteGuideLinks 결과와 같다", () => {
    const pages = ok(planDocsRead(nav, sources, {}, ORIGIN)).data.pages as { page: string }[];
    expect(pages.some((p) => p.page === "")).toBe(true);
    for (const { page } of pages) {
      const item = flat.find((f) => f.slug.join("/") === page);
      const { data, summary } = ok(planDocsRead(nav, sources, { page }, ORIGIN));
      expect(data).toEqual({
        page,
        title: item?.title,
        url: `${ORIGIN}${page === "" ? "/docs" : `/docs/${page}`}`,
        markdown: absoluteGuideLinks(sources.get(item?.file ?? "") ?? "", item?.file ?? "", ORIGIN),
      });
      expect(summary).toBe(en.mcp.summary.guidePage(item?.title ?? ""));
    }
  });

  it("origin이 없으면 url·링크가 앱 경로다", () => {
    const { data } = ok(planDocsRead(nav, sources, { page: "" }, null));
    expect(data.url).toBe("/docs");
    expect(data.markdown).toBe(absoluteGuideLinks(sources.get("README.md") ?? "", "README.md", null));
  });

  it.each(["__proto__", "constructor", "/translate/publish", "translate/publish/", "docs/translate/publish", "translate/publish.md", "SHOOTING"])(
    "%s는 가이드 전용 not-found 문장이다",
    (page) => {
      const outcome = planDocsRead(nav, sources, { page }, ORIGIN);
      expect(outcome).toEqual({ status: "refused", code: "not-found", message: en.mcp.errors["docs-page-not-found"] });
      expect(en.mcp.errors["docs-page-not-found"]).not.toMatch(/project/i);
    },
  );

  it("`translate/publish`는 실물 SUMMARY에 있다 — 위 거부 목록이 그 이웃 변형임을 고정한다", () => {
    expect(ok(planDocsRead(nav, sources, { page: "translate/publish" }, ORIGIN)).data.page).toBe("translate/publish");
  });
});

describe("planDocsRead — 검색 (fixture)", () => {
  const page = (title: string, file: string, slug: string[]): NavNode => ({ title, file, slug, children: [] });
  const nav: NavNode[] = [
    page("Malmoi", "README.md", []),
    page("Before publish", "before.md", ["before"]),
    page("Zeta", "zeta.md", ["zeta"]),
    page("Publish changes", "publish.md", ["publish"]),
  ];
  const sources = new Map([
    ["README.md", "# Malmoi\n\nThe intro mentions publish once. See [setup](zeta.md#publish-step).\n"],
    ["before.md", "# Before publish\n\nNothing else.\n"],
    ["zeta.md", "# Zeta\n\nIntro.\n\n## Publish step {#publish-step}\n\nDo it. Read [the overview](README.md).\n"],
    ["publish.md", "# Publish changes\n\nLead.\n\n## Send {#send}\n\nSend it.\n"],
  ]);
  type Result = { page: string; title: string; section: string | null; url: string; markdown: string };
  const results = (query: string, n = nav, s = sources) => ok(planDocsRead(n, s, { query }, ORIGIN)).data.results as Result[];

  it("점수는 제목 접두 > 제목 > 절 제목 > 본문 순이고 동점은 SUMMARY 순서다", () => {
    expect(results("publish").map((r) => `${r.page}#${r.section ?? ""}`)).toEqual([
      "publish#", "publish#Send", "before#", "zeta#Publish step", "#",
    ]);
  });

  it("각 결과는 같은 (page, anchor)의 절 조각이고 링크는 origin 절대 URL이다", () => {
    const found = results("publish");
    const zeta = found.find((r) => r.page === "zeta");
    expect(zeta).toEqual({
      page: "zeta", title: "Zeta", section: "Publish step", url: `${ORIGIN}/docs/zeta#publish-step`,
      markdown: `## Publish step {#publish-step}\n\nDo it. Read [the overview](${ORIGIN}/docs).`,
    });
    const intro = found.find((r) => r.page === "");
    expect(intro).toEqual({
      page: "", title: "Malmoi", section: null, url: `${ORIGIN}/docs`,
      markdown: `The intro mentions publish once. See [setup](${ORIGIN}/docs/zeta#publish-step).`,
    });
    for (const r of found) {
      const file = nav.find((n) => n.slug.join("/") === r.page)?.file ?? "";
      const slices = sectionSlices(absoluteGuideLinks(sources.get(file) ?? "", file, ORIGIN));
      expect(slices.map((slice) => slice.markdown)).toContain(r.markdown);
    }
  });

  it("6건 이상이면 5건으로 자르고 동점은 SUMMARY 순서를 지킨다", () => {
    const many = Array.from({ length: 7 }, (_, i) => page(`Page ${i}`, `p${i}.md`, [`p${i}`]));
    const manySources = new Map(many.map((p) => [p.file, `# ${p.title}\n\nShared needle text.\n`]));
    expect(results("needle", many, manySources).map((r) => r.page)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  it("유니코드 query가 동작한다", () => {
    const uni = [page("Café notes", "cafe.md", ["cafe"])];
    const found = results("CAFÉ", uni, new Map([["cafe.md", "# Café notes\n\nCrème brûlée.\n"]]));
    expect(found.map((r) => r.page)).toEqual(["cafe"]);
  });

  it("summary는 건수를 단수·복수로 말한다", () => {
    expect(ok(planDocsRead(nav, sources, { query: "publish" }, ORIGIN)).summary).toBe(en.mcp.summary.guideMatches(5));
    expect(ok(planDocsRead(nav, sources, { query: "nothing else" }, ORIGIN)).summary).toBe(en.mcp.summary.guideMatches(1));
  });

  it("0건은 ok + 빈 배열이고 다음 행동을 말한다", () => {
    const outcome = ok(planDocsRead(nav, sources, { query: "absent" }, ORIGIN));
    expect(outcome.data).toEqual({ query: "absent", results: [] });
    expect(outcome.summary).toBe(en.mcp.summary.guideNoMatches("absent"));
  });

  it.each([
    ["공백만 있는 query", { query: "   " }],
    ["page와 query를 함께", { page: "", query: "publish" }],
  ])("%s는 invalid-input이다", (_, input) => {
    expect(planDocsRead(nav, sources, input, ORIGIN)).toEqual({ status: "invalid-input" });
  });

  it("같은 입력을 두 번 주면 같은 출력이다", () => {
    for (const input of [{}, { page: "zeta" }, { query: "publish" }]) {
      expect(planDocsRead(nav, sources, input, ORIGIN)).toEqual(planDocsRead(nav, sources, input, ORIGIN));
    }
  });
});
