import { describe, expect, it } from "vitest";

import type { DetectedFormat } from "../../adapters/types";
import { selectLocaleFiles } from "../../push/payload";
import type { SurveyInput } from "../types";
import { filesForFormat, surveyLocalePath } from "../one";

/**
 * survey도 프로덕션과 같은 경로를 잰다 (mobile-strings design §2) — 측정 층이 기준 언어 파일을 치환으로 찾으면 Android 리포의
 * `values/strings.xml`을 못 읽어 왕복·diff 지표가 조용히 빈다.
 */
const format: DetectedFormat = {
  adapter: "json-catalog", pathTemplate: "res/values-{locale}/strings.json", basePath: "res/values/strings.json", locales: ["en", "ko"],
};

describe("surveyLocalePath", () => {
  it("기준 언어는 basePath다", () => {
    expect(surveyLocalePath(format, "en", "en")).toBe("res/values/strings.json");
  });

  it("다른 언어는 치환이다", () => {
    expect(surveyLocalePath(format, "ko", "en")).toBe("res/values-ko/strings.json");
  });

  it("기준 언어를 모르거나 basePath가 없으면 전부 치환이다 — 기존 측정 그대로", () => {
    expect(surveyLocalePath(format, "en", undefined)).toBe("res/values-en/strings.json");
    const { basePath: _, ...plain } = format;
    expect(surveyLocalePath(plain, "en", "en")).toBe("res/values-en/strings.json");
  });
});

describe("filesForFormat — 프로덕션 selectLocaleFiles와 같은 선택", () => {
  const files = new Map([
    ["res/values/strings.json", "{}"],
    ["res/values-ko/strings.json", "{}"],
    ["res/values-en/strings.json", "{}"],
    ["res/values-fr/strings.json", "{}"],
  ]);
  const input = { paths: [...files.keys()], files } as unknown as SurveyInput;
  const withBase: DetectedFormat = { ...format, locales: ["ko", "fr", "en"], templateLocale: "en" };

  it("per-locale은 selectLocaleFiles의 경로·순서를 그대로 낸다", () => {
    const expected = selectLocaleFiles("per-locale", withBase, input.paths, (p) => files.get(p), "en");
    expect(filesForFormat(withBase, input)).toEqual(expected);
    // basePath가 기준 언어 파일이고 `values-en/`은 읽지 않는다. 순서는 format.locales다(정렬하지 않는다).
    expect(expected.map((f) => f.path)).toEqual(["res/values-ko/strings.json", "res/values-fr/strings.json", "res/values/strings.json"]);
  });
});
