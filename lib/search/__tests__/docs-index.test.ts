import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { headings, parseMd } from "@/lib/guide/parse";
import { flattenNav, parseSummary } from "@/lib/guide/summary";
import { routes } from "@/lib/routes";
import { docsSearchEntries } from "../docs-index";
const read = (file: string) => parseMd(readFileSync(join(process.cwd(), "guide", "en", file), "utf8"));
describe("가이드 색인", () => {
  it("실물 SUMMARY 페이지와 표식 H2 전량·순서·주소가 맞는다", () => {
    const summary = parseSummary(read("SUMMARY.md"));
    const pages = flattenNav(summary);
    expect(pages).toHaveLength(31);
    const entries = docsSearchEntries(summary, read);
    expect(entries).toHaveLength(pages.length + pages.reduce((n, p) => n + headings(read(p.file)).filter(h => h.depth === 2 && h.id !== null).length, 0));
    expect(entries.filter(e => e.anchor === null).map(e => e.page)).toEqual(pages.map(p => p.slug.join("/")));
    for (const e of entries) expect(e.href).toBe(routes.docs(e.page, e.anchor ?? undefined));
    expect(JSON.stringify(entries)).not.toMatch(/AUTHORING|SHOOTING/);
  });
  it("표식 없는 H2는 스킵·H3는 부모에 포함·코드는 포함·이미지 alt 제외", () => {
    const summary = parseSummary(parseMd("- [Title](page.md)"));
    const entries = docsSearchEntries(summary, () => parseMd("# Title\nIntro\n## Skip\nSkipped text\n## Section {#section}\nBody\n### Child {#child}\nChild body\n```ts\nTOKEN\n```\n![secret-alt](x.png)"));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ title: "Title", section: null, anchor: null, body: "Intro" });
    expect(entries[1]).toMatchObject({ title: "Title", section: "Section", context: "Section", anchor: "section" });
    expect(entries[1]?.body).toContain("Child body");
    expect(entries[1]?.body).toContain("TOKEN");
    expect(entries[1]?.body).not.toMatch(/secret-alt|Skipped|#section|#child/);
  });
});
