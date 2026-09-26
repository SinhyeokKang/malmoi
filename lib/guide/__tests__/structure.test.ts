import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { legacyAnchorTarget } from "../legacy";
import { LEGACY_ANCHORS } from "../legacy-anchors";
import { headings, parseMd } from "../parse";
import { leadParagraph, parseMdTable } from "../sections";
import { flattenNav, parseSummary, slugToFile } from "../summary";

const GUIDE = fileURLToPath(new URL("../../../guide/", import.meta.url));
const read = (file: string) => parseMd(readFileSync(join(GUIDE, file), "utf8"));
const nav = () => flattenNav(parseSummary(read("SUMMARY.md")));

function markdownFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return markdownFiles(join(dir, entry.name), `${file}/`);
    return entry.name.endsWith(".md") ? [file] : [];
  });
}

describe("실물 가이드 구조", () => {
  it("SUMMARY와 실제 원고가 일치하고 운영 매뉴얼만 서빙 밖에 둔다", () => {
    const files = nav().map(({ file }) => file);
    expect(files.length).toBeGreaterThan(0);
    expect(markdownFiles(GUIDE).filter((file) => !["SUMMARY.md", "AUTHORING.md", "SHOOTING.md"].includes(file)).sort()).toEqual([...files].sort());
    expect(files).toContain("README.md");
    expect(slugToFile(["AUTHORING"], files)).toBeNull();
    expect(slugToFile(["SHOOTING"], files)).toBeNull();
  });

  it("페이지마다 H1 하나와 도입 문단이 있고 H2 앵커가 빠지거나 겹치지 않는다", () => {
    for (const { file, title } of nav()) {
      const tree = read(file);
      const all = headings(tree);
      expect(all.filter(({ depth }) => depth === 1), file).toHaveLength(1);
      expect(all.find(({ depth }) => depth === 1)?.text, file).toBe(title);
      expect(leadParagraph(tree), file).not.toBeNull();
      for (const heading of all.filter(({ depth }) => depth === 2)) {
        expect(heading.id, `${file}: ${heading.text}`).toMatch(/^[a-z0-9-]+$/);
      }
      const ids = all.flatMap(({ id }) => id === null ? [] : [id]);
      expect(new Set(ids).size, file).toBe(ids.length);
    }
  });

  it("옛 해시 일곱의 전체 매핑을 고정한다", () => {
    expect(LEGACY_ANCHORS).toEqual({
      "how-it-works": "/docs/sync#how-it-works",
      workflow: "/docs/setup/workflow#workflow",
      "allowed-actions": "/docs/setup/allowed-actions#allowed-actions",
      formats: "/docs/reference/formats#formats",
      limits: "/docs/reference/limits#limits",
      merging: "/docs/sync/merging#merging",
      nightly: "/docs/sync/nightly#nightly",
    });
    const files = nav().map(({ file }) => file);
    for (const [id, target] of Object.entries(LEGACY_ANCHORS)) {
      expect(legacyAnchorTarget(`#${id}`, LEGACY_ANCHORS)).toBe(target);
      const [path, anchor] = target.slice("/docs/".length).split("#");
      const file = slugToFile(path!.split("/"), files);
      expect(file, target).not.toBeNull();
      expect(headings(read(file!)).map(({ id }) => id), target).toContain(anchor);
    }
  });

  it("작성 규약의 외부 라벨 표가 GitHub 라벨을 고정한다", () => {
    expect(parseMdTable(read("AUTHORING.md"), "external-labels")).toEqual(expect.arrayContaining([
      expect.objectContaining({ "라벨": "Settings" }),
      expect.objectContaining({ "라벨": "Secrets and variables" }),
      expect.objectContaining({ "라벨": "Actions" }),
      expect.objectContaining({ "라벨": "New repository secret" }),
      expect.objectContaining({ "라벨": "Allow select actions" }),
      expect.objectContaining({ "라벨": "Set up job" }),
      expect.objectContaining({ "라벨": "Repository access" }),
      expect.objectContaining({ "라벨": "Choose repositories" }),
      expect.objectContaining({ "라벨": "Only select repositories" }),
    ]));
  });
});
