import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";

import { UI_LOCALES } from "@/lib/i18n/locales";
import { collectImages, collectLinks, collectUiLabels } from "../collect";
import { headings, parseMd } from "../parse";
import { flattenNav, parseSummary } from "../summary";
import { guideTrees } from "./helpers/served";

/**
 * **언어별 원고 세 벌의 구조 동형** (ui-locales design §6.1) — en이 원문이고 ko·es는 같은 모양의 번역이다.
 * 폴백이 없으므로(ko에 없는 페이지를 en으로 메우지 않는다) 파일 하나만 빠져도 그 언어의 `/docs`가 404를 낸다.
 * 절 id는 앱 안 링크(`routes.docs`)와 `legacy-anchors.ts`가 언어와 무관하게 가리키므로 번역하지 않는다.
 */
const GUIDE = fileURLToPath(new URL("../../../guide/", import.meta.url));

function markdownFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return markdownFiles(join(dir, entry.name), `${file}/`);
    return entry.name.endsWith(".md") ? [file] : [];
  });
}

/**
 * 번역이 바꾸면 안 되는 것 — 앵커 · 이미지 경로 · 링크 대상 · 번호 단계 수 · 굵은 라벨 수. 문장은 언어마다 다르다.
 * ⚠️ 라벨 수는 **굵게가 닫혔는지**를 잰다 — `**본인이 아닙니까?**를`처럼 문장부호로 끝난 라벨 뒤에 조사가 붙으면 CommonMark가
 * 닫는 `**`로 보지 않아 별표가 화면에 그대로 남는다(띄어쓰기 없는 언어에서만 생기는 부류).
 */
function guideShape(tree: Root) {
  let steps = 0;
  visit(tree, "list", (list) => {
    if (list.ordered === true) steps += list.children.length;
  });
  return {
    anchors: headings(tree).map(({ depth, id }) => `${depth}:${id ?? ""}`),
    images: collectImages(tree).map(({ src }) => src),
    links: collectLinks(tree).map(({ url }) => url),
    labels: collectUiLabels(tree).length,
    steps,
  };
}

const trees = guideTrees(GUIDE);
const read = (dir: string, file: string) => parseMd(readFileSync(join(dir, file), "utf8"));
const summaryFiles = (dir: string) => flattenNav(parseSummary(read(dir, "SUMMARY.md"))).map(({ file }) => file);
const en = trees.find(({ uiLocale }) => uiLocale === "en");

describe("guideShape", () => {
  it("앵커·이미지·링크·번호 단계를 잡고 문장은 보지 않는다", () => {
    const a = guideShape(parseMd("# A\n\nLead.\n\n## Step {#step}\n\n1. One [x](b.md#y)\n2. Two\n\n![Alt](/guide/a.webp)\n"));
    const b = guideShape(parseMd("# 가\n\n도입.\n\n## 단계 {#step}\n\n1. 하나 [엑스](b.md#y)\n2. 둘\n\n![대체](/guide/a.webp)\n"));
    expect(b).toEqual(a);
    expect(a).toEqual({ anchors: ["1:", "2:step"], images: ["/guide/a.webp"], links: ["b.md#y"], labels: 0, steps: 2 });
  });

  it("문장부호로 끝난 굵은 라벨에 조사가 붙어 굵게가 안 닫히면 다르다", () => {
    const a = guideShape(parseMd("# A\n\nChoose **Not you?** to switch.\n"));
    expect(a.labels).toBe(1);
    expect(guideShape(parseMd("# 가\n\n**본인이 아닙니까?**를 선택합니다.\n"))).not.toEqual(a);
    expect(guideShape(parseMd("# 가\n\n**본인이 아닙니까?** 링크를 선택합니다.\n"))).toEqual(a);
  });

  it("번역에서 단계가 빠지거나 앵커를 번역하면 다르다", () => {
    const a = guideShape(parseMd("# A\n\n## Step {#step}\n\n1. One\n2. Two\n"));
    expect(guideShape(parseMd("# 가\n\n## 단계 {#step}\n\n1. 하나\n"))).not.toEqual(a);
    expect(guideShape(parseMd("# 가\n\n## 단계 {#danggye}\n\n1. 하나\n2. 둘\n"))).not.toEqual(a);
  });

  it("이미지 경로나 링크 대상을 바꾸면 다르다", () => {
    const a = guideShape(parseMd("# A\n\nSee [x](b.md#y).\n\n![Alt](/guide/a.webp)\n"));
    expect(guideShape(parseMd("# 가\n\n[엑스](b.md#y) 참고.\n\n![대체](/guide/other.webp)\n"))).not.toEqual(a);
    expect(guideShape(parseMd("# 가\n\n[엑스](c.md#y) 참고.\n\n![대체](/guide/a.webp)\n"))).not.toEqual(a);
    expect(guideShape(parseMd("# 가\n\n[엑스](b.md#y) 참고.\n\n![대체](/guide/a.webp)\n"))).toEqual(a);
  });
});

describe("실물 가이드 — 언어별 트리", () => {
  it("en 트리가 있고 guide/ 루트에는 비서빙 매뉴얼과 언어 디렉터리만 있다", () => {
    expect(en).toBeDefined();
    const root = readdirSync(GUIDE, { withFileTypes: true });
    expect(root.filter((entry) => entry.isFile()).map(({ name }) => name).sort()).toEqual(["AUTHORING.md", "SHOOTING.md"]);
    for (const entry of root.filter((e) => e.isDirectory())) expect(UI_LOCALES, entry.name).toContain(entry.name);
    // 디렉터리가 있는데 SUMMARY가 없으면 guideTrees가 조용히 빼므로 여기서 잡는다
    expect(trees.map(({ uiLocale }) => uiLocale).sort()).toEqual(root.filter((e) => e.isDirectory()).map(({ name }) => name).sort());
  });

  // 닫는 조건 — 화면 언어마다 원고 트리가 있다. 없으면 그 언어의 `/docs`가 던지고(폴백 없음) 검색 색인 파일이 안 생긴다.
  // `UI_LOCALES`에 언어를 더하거나 트리를 지우면 여기서 red다(W4 R4 🟡1).
  it("모든 화면 언어에 원고 트리가 있다", () => {
    expect(trees.map(({ uiLocale }) => uiLocale)).toEqual([...UI_LOCALES]);
  });

  for (const { uiLocale, dir } of trees.filter(({ uiLocale }) => uiLocale !== "en")) {
    describe(uiLocale, () => {
      it("파일 집합과 SUMMARY 순서가 en과 같다", () => {
        expect(markdownFiles(dir).sort()).toEqual(markdownFiles(en!.dir).sort());
        expect(summaryFiles(dir)).toEqual(summaryFiles(en!.dir));
      });

      it("페이지마다 앵커·이미지·링크·번호 단계 수가 en과 같다", () => {
        for (const file of summaryFiles(en!.dir)) {
          expect(guideShape(read(dir, file)), `${relative(GUIDE, dir)}/${file}`).toEqual(guideShape(read(en!.dir, file)));
        }
      });
    });
  }
});
