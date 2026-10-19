import { describe, expect, it } from "vitest";

import { baseFilePath } from "../base-path";

/**
 * 기준 언어 파일 경로 (mobile-strings design §2). Android의 `values/strings.xml`은 `{locale}` 치환으로 표현되지 않아
 * `basePath`가 따로 든다 — 그 밖의 표면(null)은 지금처럼 치환이다.
 */
describe("baseFilePath — basePath ?? 치환", () => {
  it("basePath가 없으면 템플릿에 기준 언어를 넣는다", () => {
    expect(baseFilePath({ pathTemplate: "i18n/{locale}.json" }, "en")).toBe("i18n/en.json");
  });

  it("null은 없는 것과 같다 — DB 컬럼은 null로 온다", () => {
    expect(baseFilePath({ pathTemplate: "i18n/{locale}.json", basePath: null }, "en")).toBe("i18n/en.json");
  });

  it("basePath가 있으면 그것이 기준 언어 경로다 — 치환하지 않는다", () => {
    const format = { pathTemplate: "app/src/main/res/values-{locale}/strings.xml", basePath: "app/src/main/res/values/strings.xml" };
    expect(baseFilePath(format, "en")).toBe("app/src/main/res/values/strings.xml");
  });

  it("{locale}이 여러 번이면 전부 바꾼다 — replaceAll이 경로를 만드는 규칙이다", () => {
    expect(baseFilePath({ pathTemplate: "{locale}/{locale}.json" }, "ko")).toBe("ko/ko.json");
  });
});
