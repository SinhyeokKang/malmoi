import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { servedGuideFiles } from "./helpers/served";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("servedGuideFiles — 화면에 닿는 md만", () => {
  it("SUMMARY와 거기 오른 페이지만 — AUTHORING·SHOOTING·미등재 파일은 빠진다", () => {
    expect(servedGuideFiles(fixture("scan/guide"))).toEqual(["SUMMARY.md", "formats.md"]);
  });

  it("하위 페이지까지 선위 순서로", () => {
    expect(servedGuideFiles(fixture("site/guide"))).toEqual(["SUMMARY.md", "README.md", "setup/README.md", "setup/workflow.md"]);
  });

  it("`guide/`가 없으면 빈 목록이다 — 원고가 서기 전에도 스캐너가 산다", () => {
    expect(servedGuideFiles(fixture("does-not-exist"))).toEqual([]);
  });
});
