import { describe, expect, it } from "vitest";
import { manualBasePath, validBaseInput } from "../base-input";

describe("validBaseInput", () => {
  it("basePath가 없으면 관측된 코드만 기준이 된다", () => {
    const format = { basePath: null, locales: ["en", "ko"] };
    expect(validBaseInput(format, "en")).toBe(true);
    expect(validBaseInput(format, "fr")).toBe(false);
    expect(validBaseInput({ locales: ["en"] }, "en")).toBe(true);
  });
  it("basePath가 있으면 관측된 번역 파일의 코드는 거부한다", () => {
    const format = { basePath: "res/values/strings.xml", locales: ["de"] };
    expect(validBaseInput(format, "en")).toBe(true);
    expect(validBaseInput(format, "de")).toBe(false);
  });
  it.each(["", "../en", "en/us", "english-language-name"])("basePath가 있어도 잘못된 코드 %s는 거부한다", code => {
    expect(validBaseInput({ basePath: "res/values/strings.xml", locales: [] }, code)).toBe(false);
  });
});

describe("manualBasePath", () => {
  it.each([
    ["app/src/main/res/values-{locale}/strings.xml", "app/src/main/res/values/strings.xml"],
    ["res/values-{locale}/strings.xml", "res/values/strings.xml"],
    ["shared/src/commonMain/composeResources/values-{locale}/strings.xml", "shared/src/commonMain/composeResources/values/strings.xml"],
  ])("Android 템플릿 %s의 기준 파일은 %s다", (template, base) => {
    expect(manualBasePath("android-strings", template)).toBe(base);
  });
  it.each([
    "values-{locale}/strings.xml",
    "app/values-{locale}/strings.xml",
    "app/src/main/other/values-{locale}/strings.xml",
    "app/src/main/res/values-{locale}/other.xml",
    "app/src/main/res/values-{locale}/strings.xml.bak",
    "app/src/main/res/values/strings.xml",
  ])("res·composeResources 밖이나 모양이 다른 %s에는 기준 경로가 없다", template => {
    expect(manualBasePath("android-strings", template)).toBeUndefined();
  });
  it("Android가 아닌 어댑터에는 기준 경로가 없다", () => {
    expect(manualBasePath("json-catalog", "app/src/main/res/values-{locale}/strings.xml")).toBeUndefined();
  });
});
