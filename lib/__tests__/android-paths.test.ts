import { describe, expect, it } from "vitest";
import { ANDROID_STRINGS_FILE, ANDROID_STRINGS_TEMPLATE, androidBasePath, androidResourceDir } from "../android-paths";
import { ANDROID_STRINGS_FILE as FROM_ADAPTER } from "../adapters/android-strings";

describe("Android 기준 경로 규칙", () => {
  it("어댑터가 같은 정규식을 다시 내보낸다", () => {
    expect(FROM_ADAPTER).toBe(ANDROID_STRINGS_FILE);
  });
  it("템플릿에서 리소스 디렉터리와 기준 파일을 낸다", () => {
    const t = "app/src/main/res/values-{locale}/strings.xml";
    expect(androidResourceDir(t)).toBe("app/src/main/res/");
    expect(androidBasePath(t)).toBe("app/src/main/res/values/strings.xml");
    expect(ANDROID_STRINGS_TEMPLATE.test(t)).toBe(true);
  });
  it.each(["values-{locale}/strings.xml", "app/values-{locale}/strings.xml", "a/res/values-{locale}/x.xml", "a/res/values/strings.xml"])("%s는 템플릿이 아니다", t => {
    expect(androidResourceDir(t)).toBeUndefined();
    expect(androidBasePath(t)).toBeUndefined();
  });
  it("템플릿에서 낸 기준 파일은 파일 규칙도 통과하고 한정자가 없다", () => {
    const base = androidBasePath("x/composeResources/values-{locale}/strings.xml")!;
    expect(ANDROID_STRINGS_FILE.exec(base)?.[2]).toBeUndefined();
  });
});
