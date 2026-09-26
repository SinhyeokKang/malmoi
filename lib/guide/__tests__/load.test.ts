import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { headings } from "../parse";

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

  it("import만으로는 아무것도 읽지 않는다 — SUMMARY가 없어도 import가 산다", async () => {
    const mod = await load("/nonexistent-guide-root");
    expect(() => mod.loadSummary()).toThrow(/ENOENT/);
  });
});
