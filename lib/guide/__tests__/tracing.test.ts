import { globSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";
import { guideTrees, servedGuideFiles } from "./helpers/served";

/**
 * **`/docs` 함수에 원고가 실린다** — `load.ts`가 `fs`로 읽어 트레이서가 못 따라가므로 `outputFileTracingIncludes` 글롭이 유일한 운반이다.
 * 글롭이 `./guide/en/**`처럼 좁아지면 Vercel에서만 ko·es `/docs`가 500이다(로컬 `next start`는 리포 파일을 읽어 못 잡는다).
 * 실제 nft 확인은 빌드 산출물이지만 "글롭이 모든 언어 트리와 촬영 매뉴얼을 덮는다"는 여기서 고정한다.
 */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

describe("outputFileTracingIncludes — /docs", () => {
  it("글롭이 존재하는 모든 언어 트리의 서빙 원고와 SHOOTING을 덮는다", () => {
    const globs = nextConfig.outputFileTracingIncludes?.["/docs/[[...slug]]"] ?? [];
    expect(globs.length).toBeGreaterThan(0);
    const traced = new Set(globs.flatMap((glob) => globSync(glob, { cwd: ROOT })).map((path) => path.replace(/^\.\//, "")));
    const trees = guideTrees(join(ROOT, "guide"));
    expect(trees.map(({ uiLocale }) => uiLocale)).toContain("ko");
    const needed = [
      "guide/SHOOTING.md",
      ...trees.flatMap(({ dir }) => servedGuideFiles(dir).map((file) => relative(ROOT, join(dir, file)))),
    ];
    expect(needed.filter((path) => !traced.has(path))).toEqual([]);
  });
});

/**
 * **`/api/mcp` 함수에 en 원고가 실린다** (mcp-docs T5) — MCP `read_docs`가 요청마다 `guide/en`을 `fs`로 읽는다. nft가 지금은 그 읽기를
 * 따라 `guide/` 전체를 싣지만 휴리스틱이라, include 글롭(MCP는 영어 고정이라 en만)이 en 원고를 보장한다.
 */
describe("outputFileTracingIncludes — /api/mcp", () => {
  it("글롭이 en 서빙 원고 전부와 SUMMARY를 덮는다", () => {
    const globs = nextConfig.outputFileTracingIncludes?.["/api/mcp"] ?? [];
    expect(globs.length).toBeGreaterThan(0);
    const traced = new Set(globs.flatMap((glob) => globSync(glob, { cwd: ROOT })).map((path) => path.replace(/^\.\//, "")));
    const dir = join(ROOT, "guide", "en");
    const needed = servedGuideFiles(dir).map((file) => relative(ROOT, join(dir, file)));
    expect(needed).toContain("guide/en/SUMMARY.md");
    expect(needed.filter((path) => !traced.has(path))).toEqual([]);
  });
});
