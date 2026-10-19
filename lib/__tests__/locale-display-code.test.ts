import { describe, expect, it } from "vitest";

import { localeTextAttrs } from "@/lib/translations/text-direction";
import { flagFor } from "@/lib/keys/flag";
import { languageName } from "@/lib/onboarding/language-name";
import { displayLocaleCode } from "@/lib/locale-code";

/**
 * Android 리소스 철자의 지역(`zh-rCN`·`pt-rBR`)을 **표시·방향 판정에서만** BCP 47로 읽는다(android-strings design §2.2). 저장 코드는 그대로다 —
 * 경로 치환이 그 문자열을 도로 끼운다. 어느 어댑터의 코드인지 모르는 소비자(③ 기준 언어 행·언어 추가 Dialog·Logs·국기)가 한 번에 따라오도록
 * 어댑터를 묻지 않는다.
 */
describe("displayLocaleCode", () => {
  it.each([
    ["zh-rCN", "zh-CN"],
    ["pt-rBR", "pt-BR"],
    ["fil-rPH", "fil-PH"],
    ["iw-rIL", "iw-IL"],
  ])("%s → %s", (code, expected) => expect(displayLocaleCode(code)).toBe(expected));

  it.each(["zh-CN", "pt_BR", "ko", "zh-Hans", "rCN", "en-rgb", "b+sr+Latn", "es-r419"])("%s는 그대로다", (code) => expect(displayLocaleCode(code)).toBe(code));
});

describe("Android 철자의 표시", () => {
  it("languageName이 지역을 푼 이름을 낸다 — 전에는 RangeError로 코드가 그대로 나왔다", () => {
    expect(languageName("zh-rCN", "en")).toBe(languageName("zh-CN", "en"));
    expect(languageName("pt-rBR", "en")).toBe("Portuguese (Brazil)");
  });

  it("flagFor가 지역 국기를 고른다 — 전에는 `rbr`을 지역으로 못 읽어 언어 국기(포르투갈)였다", () => {
    expect(flagFor("pt-rBR")).toBe(flagFor("pt-BR"));
    expect(flagFor("zh-rTW")).toBe(flagFor("zh-TW"));
  });

  it("텍스트 방향이 iw-rIL을 rtl로 읽는다 — 전에는 Intl.Locale이 던져 auto였다", () => {
    expect(localeTextAttrs("iw-rIL").dir).toBe("rtl");
    expect(localeTextAttrs("zh-rCN")).toEqual(localeTextAttrs("zh-CN"));
  });
});
