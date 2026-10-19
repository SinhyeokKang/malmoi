import { describe, expect, it } from "vitest";

import type { DetectedFormat } from "../../adapters/types";
import { surveyLocalePath } from "../one";

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
