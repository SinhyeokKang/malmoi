import { describe, expect, it } from "vitest";

import { changedLocaleFileCount } from "../remote-plan";

/**
 * "base가 앞섰다"의 숫자 (mobile-strings design §2). 빠지면 가장 흔한 변경인 `values/strings.xml` 편집이 0으로 집계된다.
 */
const format = { adapter: "json-catalog" as const, pathTemplate: "res/values-{locale}/strings.json", storedLocales: ["en", "ko"], baseLocale: "en", basePath: "res/values/strings.json" };

describe("changedLocaleFileCount — basePath", () => {
  it("기준 언어 파일(basePath) 편집을 센다", () => {
    expect(changedLocaleFileCount(format, [{ filename: "res/values/strings.json" }])).toBe(1);
  });

  it("basePath와 치환 경로를 파일 레코드당 한 번씩 센다", () => {
    expect(changedLocaleFileCount(format, [{ filename: "res/values/strings.json" }, { filename: "res/values-ko/strings.json" }, { filename: "README.md" }])).toBe(2);
  });

  it("basePath가 없으면 템플릿 밖 파일은 세지 않는다 — 지금과 같다", () => {
    expect(changedLocaleFileCount({ ...format, basePath: null }, [{ filename: "res/values/strings.json" }])).toBe(0);
  });
});
