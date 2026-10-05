import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { guideTrees, servedGuideFiles } from "./helpers/served";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("servedGuideFiles — 화면에 닿는 md만", () => {
  it("SUMMARY와 거기 오른 페이지만 — 미등재 파일은 빠진다", () => {
    expect(servedGuideFiles(fixture("scan/guide/en"))).toEqual(["SUMMARY.md", "formats.md"]);
  });

  it("하위 페이지까지 선위 순서로", () => {
    expect(servedGuideFiles(fixture("site/guide/en"))).toEqual(["SUMMARY.md", "README.md", "setup/README.md", "setup/workflow.md"]);
  });

  it("guideTrees — SUMMARY가 있는 언어만, UI_LOCALES 순서로", () => {
    expect(guideTrees(fixture("site/guide")).map(({ uiLocale }) => uiLocale)).toEqual(["en", "ko"]);
    expect(guideTrees(fixture("does-not-exist"))).toEqual([]);
  });

  it("`guide/`가 없으면 빈 목록이다 — 원고가 서기 전에도 스캐너가 산다", () => {
    expect(servedGuideFiles(fixture("does-not-exist"))).toEqual([]);
  });
});
