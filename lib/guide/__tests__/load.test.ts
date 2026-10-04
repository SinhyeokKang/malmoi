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
    expect(loadSummary("en").map(({ file }) => file)).toEqual(["README.md", "setup/README.md"]);
  });

  it("화면 언어의 트리를 읽는다 — 같은 파일 경로, 그 언어의 제목과 본문", async () => {
    const { loadSummary, loadPageBySlug } = await load(SITE);
    expect(loadSummary("ko").map(({ title }) => title)).toEqual(["Malmoi", "프로젝트 설정"]);
    expect(loadSummary("en").map(({ title }) => title)).toEqual(["Malmoi", "Set up a project"]);
    const page = loadPageBySlug("ko", ["setup", "workflow"]);
    expect(page?.file).toBe("setup/workflow.md");
    expect(headings(page!.tree).map(({ text }) => text)).toEqual(["워크플로 추가", "두는 곳"]);
  });

  it("트리가 없는 언어는 던진다 — en으로 떨어지지 않는다(폴백 없음, design §6.1)", async () => {
    const { loadSummary } = await load(SITE);
    expect(() => loadSummary("es")).toThrow(/ENOENT/);
  });

  it("slug로 페이지를 찾는다", async () => {
    const { loadPageBySlug } = await load(SITE);
    const page = loadPageBySlug("en", ["setup", "workflow"]);
    expect(page?.file).toBe("setup/workflow.md");
    expect(headings(page!.tree).map(({ id }) => id)).toEqual([null, "workflow"]);
  });

  it("없는 slug와 AUTHORING은 null이다 — 파일이 있어도", async () => {
    const { loadPageBySlug } = await load(SITE);
    expect(loadPageBySlug("en", ["missing"])).toBeNull();
    expect(loadPageBySlug("en", ["AUTHORING"])).toBeNull();
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

  it("원고 원문을 그대로 읽는다 — `llms-full.txt`가 싣는 바이트다", async () => {
    const { loadSource, loadSummary } = await load(SITE);
    for (const { file } of loadSummary("en")) {
      expect(loadSource("en", file)).toBe(readFileSync(join(SITE, "guide", "en", file), "utf8"));
    }
  });

  it("import만으로는 아무것도 읽지 않는다 — SUMMARY가 없어도 import가 산다", async () => {
    const mod = await load("/nonexistent-guide-root");
    expect(() => mod.loadSummary("en")).toThrow(/ENOENT/);
  });
});
