import { describe, expect, it } from "vitest";

import { surveyOne } from "../one";
import { selectSurveyFiles } from "../select";
import { summarize } from "../summarize";
import { emptyChromeFields, emptyDiffCauses, emptyErrors, emptyJsonPresentation, type RepoSurvey, type SurveyInput } from "../types";

/**
 * survey의 Android 몫 (android-strings T3.2). 측정 층이 `values/`·`values-*​/strings.xml`을 물리화하지 않으면 어댑터가 측정에서 "존재하지 않는다"
 * (POSTMORTEM 2026-09-02). 기준 언어 파일에는 코드가 없어 측정은 리포에 없는 코드 하나를 기준 언어로 둔다. 판정 비교는 `basePath`까지 본다.
 */
const BASE = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <!-- Title -->\n    <string name="title">Home</string>\n    <string name="logout">Log out</string>\n</resources>\n';
const KO = '<?xml version="1.0" encoding="utf-8"?>\r\n<resources>\r\n    <string name="title">홈</string>\r\n</resources>\r\n';
const input = (files: Record<string, string>, extra: string[] = []): SurveyInput => ({ repo: "acme/android", paths: [...Object.keys(files), ...extra], files: new Map(Object.entries(files)), configFiles: [] });

describe("selectSurveyFiles — Android", () => {
  it("res·composeResources의 `values/`와 언어 한정자 `values-*​/strings.xml`을 고르고, 다른 한정자·values 파일·build/는 고르지 않는다", () => {
    const { paths } = selectSurveyFiles([
      "app/src/main/res/values/strings.xml",
      "app/src/main/res/values-ko/strings.xml",
      "app/src/main/res/values-night/strings.xml",
      "app/src/main/res/values/colors.xml",
      "core/src/commonMain/composeResources/values/strings.xml",
      "app/build/intermediates/res/values/strings.xml",
    ]);
    expect(paths).toEqual([
      "app/src/main/res/values-ko/strings.xml",
      "app/src/main/res/values/strings.xml",
      "core/src/commonMain/composeResources/values/strings.xml",
    ]);
  });

  it("res 디렉터리마다 기준 파일 + 언어 파일 12개까지다 — 모듈이 많은 리포가 예산을 다 먹지 않는다", () => {
    const locales = Array.from({ length: 20 }, (_, i) => `l${String.fromCharCode(97 + i)}`);
    const all = ["app/src/main/res/values/strings.xml", ...locales.map((l) => `app/src/main/res/values-${l}/strings.xml`)];
    const { paths } = selectSurveyFiles(all);
    expect(paths).toContain("app/src/main/res/values/strings.xml");
    expect(paths).toHaveLength(13);
  });
});

describe("surveyOne — Android", () => {
  it("`values-{locale}` 템플릿과 basePath가 1순위이고 왕복 2층이 통과한다(비기준 파일 삽입 경로 포함)", () => {
    const s = surveyOne(input({ "app/src/main/res/values/strings.xml": BASE, "app/src/main/res/values-ko/strings.xml": KO }));
    expect(s.failure).toBeUndefined();
    expect(s.chosen).toMatchObject({ adapter: "android-strings", pathTemplate: "app/src/main/res/values-{locale}/strings.xml", basePath: "app/src/main/res/values/strings.xml" });
    // 기준 언어 파일 하나 + ko.
    expect(s.localeCount).toBe(2);
    expect(s.keyCount).toBe(2);
    expect(s.roundtrip).toEqual({ semantic: "same", byteFixpoint: "same" });
    expect(s.surgicalEditHunks).toBe(1);
  });

  it("단일 언어(`values/`만)도 측정된다", () => {
    const s = surveyOne(input({ "app/src/main/res/values/strings.xml": BASE }));
    expect(s.chosen).toMatchObject({ adapter: "android-strings", basePath: "app/src/main/res/values/strings.xml" });
    expect(s.keyCount).toBe(2);
    expect(s.roundtrip).toEqual({ semantic: "same", byteFixpoint: "same" });
  });

  it("기준 언어 코드는 리포의 언어와 겹치지 않는다 — `values-en/`이 있으면 en이 아니다", () => {
    const s = surveyOne(input({ "app/src/main/res/values/strings.xml": BASE, "app/src/main/res/values-en/strings.xml": BASE.replace("Home", "Home (US)") }));
    expect(s.localeCount).toBe(2);
    expect(s.roundtrip).toEqual({ semantic: "same", byteFixpoint: "same" });
  });
});

describe("summarize — 판정 비교가 basePath를 본다", () => {
  const survey = (basePath: string | undefined): RepoSurvey => {
    const c = { adapter: "android-strings" as const, pathTemplate: "app/src/main/res/values-{locale}/strings.xml", locales: ["ko"], ...(basePath === undefined ? {} : { basePath }) };
    return {
      repo: "acme/android", fileCount: 3, selectedFileCount: 2, truncated: false, candidates: [c], chosen: c, localeCount: 2, keyCount: 1, errors: emptyErrors(),
      keyCollisions: 0, silentSkips: 0, writeErrors: 0, roundtrip: { semantic: "same", byteFixpoint: "same" }, diffApproximate: false,
      separators: { dot: 0, underscore: 0, colon: 0, slash: 0, none: 0 }, icuPluralKeys: 0, placeholderKeys: 0, configFiles: [], localeOrderCompared: 0,
      diffCauses: emptyDiffCauses(), chromeFields: emptyChromeFields(), presentation: emptyJsonPresentation(), ms: 1,
    };
  };
  const verdict = { repo: "acme/android", correctCatalogPath: "app/src/main/res/values-{locale}/strings.xml", basePath: "app/src/main/res/values/strings.xml", note: "" };

  it("템플릿과 basePath가 둘 다 같아야 정답이다", () => {
    expect(summarize([survey("app/src/main/res/values/strings.xml")], [verdict]).metrics.misdetect.correctRank).toEqual({ "1": 1 });
    expect(summarize([survey("app/src/debug/res/values/strings.xml")], [verdict]).metrics.misdetect.correctRank).toEqual({ "없음": 1 });
  });

  it("판정에 basePath가 없으면 템플릿만 본다 — 기존 판정 그대로", () => {
    const { basePath: _, ...plain } = verdict;
    expect(summarize([survey(undefined)], [plain]).metrics.misdetect.correctRank).toEqual({ "1": 1 });
  });
});
