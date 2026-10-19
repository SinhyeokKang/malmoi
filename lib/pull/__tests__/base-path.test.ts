import { describe, expect, it } from "vitest";

import type { DetectedFormat } from "@/lib/adapters/types";

import { formatFromProject, resolveLocalePaths, type ProjectFormatColumns } from "../plan";

/**
 * pull·Publish가 쓸 경로 (mobile-strings design §2). 기준 언어 경로가 치환으로 계산되면 Publish가 없던 `values-en/`에 새 파일을 만든다.
 */
const ANDROID_TEMPLATE = "app/src/main/res/values-{locale}/strings.xml";
const ANDROID_BASE = "app/src/main/res/values/strings.xml";

const cols = (over: Partial<ProjectFormatColumns> = {}): ProjectFormatColumns => ({
  adapterName: "json-catalog", pathTemplate: ANDROID_TEMPLATE, nested: false, nestedByPath: null, baseLocale: "en", basePath: ANDROID_BASE, ...over,
});

describe("formatFromProject — basePath 컬럼을 포맷에 싣는다", () => {
  it("컬럼에 값이 있으면 포맷의 basePath가 된다", () => {
    expect(formatFromProject(cols(), ["en", "ko"]).basePath).toBe(ANDROID_BASE);
  });

  it("null이면 필드가 없다 — 기존 표면의 포맷 모양이 그대로다", () => {
    expect("basePath" in formatFromProject(cols({ basePath: null }), ["en", "ko"])).toBe(false);
  });
});

describe("resolveLocalePaths — 기준 언어만 basePath로 갈린다", () => {
  const format: DetectedFormat = { adapter: "json-catalog", pathTemplate: ANDROID_TEMPLATE, basePath: ANDROID_BASE, locales: ["ko", "en", "fr"] };

  it("기준 언어는 basePath, 나머지는 치환이다", () => {
    expect(resolveLocalePaths(format, "per-locale", [], "en")).toEqual([
      { locale: "en", path: ANDROID_BASE },
      { locale: "fr", path: "app/src/main/res/values-fr/strings.xml" },
      { locale: "ko", path: "app/src/main/res/values-ko/strings.xml" },
    ]);
  });

  it("basePath가 없으면 기준 언어도 치환이다 — 기존 표면의 동작 그대로", () => {
    const { basePath: _, ...plain } = format;
    expect(resolveLocalePaths(plain, "per-locale", [], "en").find((p) => p.locale === "en")?.path).toBe("app/src/main/res/values-en/strings.xml");
  });

  /** POSTMORTEM 2026-09-09 — 경계가 서기 전에 저장된 행을 야간 cron이 설치 토큰으로 쓴다. 경계 둘 중 이쪽이 저장된 값을 막는다. */
  it.each(["../escape/strings.xml", "/abs/strings.xml", "a//b.xml", "a/./b.xml"])("저장된 basePath가 리포를 벗어나면 던진다: %s", (basePath) => {
    expect(() => resolveLocalePaths({ ...format, basePath }, "per-locale", [], "en")).toThrow(/leaves the repository/);
  });

  it("multi-locale은 글롭 갈래 그대로다 — basePath를 보지 않는다", () => {
    const glob: DetectedFormat = { adapter: "ts-dict", pathTemplate: "src/i18n/*.ts", locales: ["en", "ko"] };
    expect(resolveLocalePaths(glob, "multi-locale", ["src/i18n/a.ts"], "en")).toEqual([{ path: "src/i18n/a.ts" }]);
  });
});
