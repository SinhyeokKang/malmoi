import { describe, expect, it } from "vitest";

import { localeTextAttrs, rtlByTable } from "@/lib/translations/text-direction";

/**
 * 로케일 코드 → 셀의 `dir`·`lang` (malmoi#91). 번역자는 실제 문자열을 고치므로 편집기가 그 언어의 읽는 방향으로 보여야
 * 한다 — 페이지의 `lang="en"`·`ltr`을 상속하면 `.` `(` `)` 같은 중립 문자가 반대 끝으로 튄다.
 */
describe("localeTextAttrs", () => {
  it.each([
    ["ar-SA", "rtl", "ar-SA"],
    ["fa-IR", "rtl", "fa-IR"],
    ["he-IL", "rtl", "he-IL"],
    ["ur", "rtl", "ur"],
    ["ckb", "rtl", "ckb"],
    ["en", "ltr", "en"],
    ["ko", "ltr", "ko"],
    ["zh-Hant-TW", "ltr", "zh-Hant-TW"],
  ] as const)("%s → dir=%s", (code, dir, lang) => {
    expect(localeTextAttrs(code)).toEqual({ dir, lang });
  });

  /** 파일 이름에서 온 코드는 `_`를 쓴다(`pt_BR`) — BCP 47로 고쳐 `lang`에 싣는다. */
  it("밑줄 구분자를 하이픈으로 고친다", () => {
    expect(localeTextAttrs("pt_BR")).toEqual({ dir: "ltr", lang: "pt-BR" });
    expect(localeTextAttrs("ar_EG")).toEqual({ dir: "rtl", lang: "ar-EG" });
  });

  /** 명시한 문자 체계가 언어 기본값을 이긴다. */
  it("script 서브태그를 따른다", () => {
    expect(localeTextAttrs("az-Arab").dir).toBe("rtl");
    expect(localeTextAttrs("pa-Guru").dir).toBe("ltr");
    expect(localeTextAttrs("uz-Arab-AF").dir).toBe("rtl");
  });

  /**
   * ⚠️ **쿠르드어는 코드만으로 방향을 모른다** — `ku-TR`은 CLDR상 Latin(ltr)인데 #91의 리포는 그 코드에 소라니(아랍 문자)를
   * 담았다. 코드로 단정하면 둘 중 하나가 거꾸로 서므로 **값이 정한다**(`dir="auto"`). script를 명시하면 그것을 따른다.
   */
  it("쿠르드어는 script가 없으면 auto다", () => {
    expect(localeTextAttrs("ku-TR")).toEqual({ dir: "auto", lang: "ku-TR" });
    expect(localeTextAttrs("ku")).toEqual({ dir: "auto", lang: "ku" });
    expect(localeTextAttrs("ku-Arab").dir).toBe("rtl");
    expect(localeTextAttrs("ku-Latn-TR").dir).toBe("ltr");
  });

  /** 파싱 못 하는 코드는 `lang`을 싣지 않는다 — 잘못된 `lang`은 없는 것보다 나쁘다(글꼴·하이픈·낭독이 틀린다). */
  it.each(["", "not a locale", "__proto__"])("해석 못 하는 코드 %j는 auto이고 lang이 없다", (code) => {
    expect(localeTextAttrs(code)).toEqual({ dir: "auto", lang: undefined });
  });
});

/** `Intl.Locale#getTextInfo`가 없는 런타임의 폴백 — 언어 부분만 본다. */
describe("rtlByTable", () => {
  it.each(["ar", "fa", "he", "iw", "ur", "ps", "sd", "ug", "yi", "dv", "ckb", "syr"])("%s는 rtl이다", (language) => {
    expect(rtlByTable(language)).toBe(true);
  });
  it.each(["en", "ko", "tr", "ku", "zh", "hi"])("%s는 rtl이 아니다", (language) => {
    expect(rtlByTable(language)).toBe(false);
  });
});
