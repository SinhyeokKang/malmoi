import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { headings, parseMd } from "../parse";
import { parseMdTable } from "../sections";
import { parseShotSize } from "../shots";

const SITE = fileURLToPath(new URL("./fixtures/site", import.meta.url));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

async function load(cwd: string) {
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  return import("../load");
}

describe("load — 얇은 로더", () => {
  it("SUMMARY를 읽어 내비를 낸다", async () => {
    const { loadSummary } = await load(SITE);
    expect(loadSummary().map(({ file }) => file)).toEqual(["README.md", "setup/README.md"]);
  });

  it("slug로 페이지를 찾는다", async () => {
    const { loadPageBySlug } = await load(SITE);
    const page = loadPageBySlug(["setup", "workflow"]);
    expect(page?.file).toBe("setup/workflow.md");
    expect(headings(page!.tree).map(({ id }) => id)).toEqual([null, "workflow"]);
  });

  it("없는 slug와 AUTHORING은 null이다 — 파일이 있어도", async () => {
    const { loadPageBySlug } = await load(SITE);
    expect(loadPageBySlug(["missing"])).toBeNull();
    expect(loadPageBySlug(["AUTHORING"])).toBeNull();
  });

  it("SHOOTING 에셋 표에서 치수를 읽는다 — 열 순서(에셋 · 소스 · blob · 치수)로", async () => {
    const { loadShotSizes } = await load(SITE);
    const sizes = loadShotSizes();
    expect(sizes["/guide/settings.webp"]).toEqual({ width: 1600, height: 900 });
    expect(Object.hasOwn(sizes, "/guide/broken.webp")).toBe(false);
  });

  it("SHOOTING이 없으면 빈 표다 — 이미지 없는 가이드는 촬영 매뉴얼 없이도 선다", async () => {
    const { loadShotSizes } = await load("/nonexistent-guide-root");
    expect(Object.keys(loadShotSizes())).toEqual([]);
  });

  it("실물 SHOOTING — 순서로 읽은 치수가 열 이름으로 읽은 값과 같다", async () => {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const { loadShotSizes } = await load(root);
    const rows = parseMdTable(parseMd(readFileSync(join(root, "guide", "SHOOTING.md"), "utf8")), "shots") ?? [];
    const sizes = loadShotSizes();
    for (const row of rows) expect(sizes[row["에셋"] ?? ""]).toEqual(parseShotSize(row["치수"] ?? "") ?? undefined);
    expect(Object.keys(sizes)).toHaveLength(rows.length);
  });

  it("import만으로는 아무것도 읽지 않는다 — SUMMARY가 없어도 import가 산다", async () => {
    const mod = await load("/nonexistent-guide-root");
    expect(() => mod.loadSummary()).toThrow(/ENOENT/);
  });
});
