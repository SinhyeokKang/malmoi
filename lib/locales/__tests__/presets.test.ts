import { describe, expect, it } from "vitest";

import { androidResourceCode, COMMON_LANGUAGES, looksLikeCodeInput, matchesLanguage, nameKey, presetCodes, presetSeparator } from "../presets";

/**
 * 추가 Dialog의 프리셋(locale-add 결정 D8·D9 · 시안 A1). 프리셋 + 자유 입력은 사용자가 요청한 기능이다 — 목록은 짧은 고정 표이고,
 * 판정(어느 코드를 받는가)은 서버 미리보기가 든다. 여기서는 표시 규칙만 잰다.
 */
describe("presetSeparator — 소스의 지역 있는 코드가 구분자를 정한다", () => {
  it("밑줄 지역 코드가 있으면 밑줄이다 — 프리셋이 locale-collision을 만들지 않는다", () => {
    expect(presetSeparator(["en", "pt_BR", "ko"])).toBe("_");
  });
  it("하이픈 지역 코드가 있으면 하이픈이다", () => {
    expect(presetSeparator(["en", "pt-BR"])).toBe("-");
  });
  it("지역 있는 코드가 하나도 없으면 하이픈이다(D9)", () => {
    expect(presetSeparator(["en", "ko", "ja", "de"])).toBe("-");
    expect(presetSeparator([])).toBe("-");
  });
  it("두 꼴이 섞여 있으면 근거가 없는 것으로 보고 하이픈이다", () => {
    expect(presetSeparator(["pt_BR", "zh-CN"])).toBe("-");
  });
});

describe("presetCodes", () => {
  it("고정 목록을 구분자로 바꿔 돌려준다 — 값은 바뀐 철자다", () => {
    expect(presetCodes("-")).toEqual(COMMON_LANGUAGES);
    const underscored = presetCodes("_");
    expect(underscored).toContain("pt_BR");
    expect(underscored).toContain("zh_CN");
    expect(underscored).not.toContain("pt-BR");
    expect(underscored.length).toBe(COMMON_LANGUAGES.length);
  });
  it("목록은 시안 A1의 코드를 포함하고 20개 안팎이다", () => {
    for (const code of ["de", "fr", "ja", "ko", "pt-BR", "zh-CN"]) expect(COMMON_LANGUAGES).toContain(code);
    expect(COMMON_LANGUAGES.length).toBeGreaterThanOrEqual(15);
    expect(COMMON_LANGUAGES.length).toBeLessThanOrEqual(25);
    expect(new Set(COMMON_LANGUAGES).size).toBe(COMMON_LANGUAGES.length);
  });
});

describe("nameKey — 이름 조회용으로만 밑줄을 하이픈으로 바꾼다", () => {
  it("밑줄 코드는 하이픈으로(`Intl.DisplayNames`가 밑줄에 RangeError다)", () => {
    expect(nameKey("en_AU")).toBe("en-AU");
    expect(nameKey("zh_CN")).toBe("zh-CN");
  });
  it("그 밖은 그대로", () => {
    expect(nameKey("pt-BR")).toBe("pt-BR");
    expect(nameKey("ko")).toBe("ko");
  });
});

describe("matchesLanguage — 코드·이름 둘 다로 거른다", () => {
  it("빈 입력은 전부 남긴다", () => {
    expect(matchesLanguage("fr", "French", "")).toBe(true);
    expect(matchesLanguage("fr", "French", "  ")).toBe(true);
  });
  it("코드 앞부분·이름 일부(대소문자 무시)", () => {
    expect(matchesLanguage("fr", "French", "fr")).toBe(true);
    expect(matchesLanguage("fr", "French", "FRE")).toBe(true);
    expect(matchesLanguage("de", "German", "fr")).toBe(false);
    expect(matchesLanguage("de", "독일어", "독일")).toBe(true);
  });
  it("구분자 철자를 가리지 않는다 — pt_br로 쳐도 pt-BR을 찾는다", () => {
    expect(matchesLanguage("pt-BR", "Portuguese (Brazil)", "pt_br")).toBe(true);
    expect(matchesLanguage("zh_CN", "Chinese (China)", "zh-cn")).toBe(true);
  });
  it("목록 밖 지역 코드(fr-CA)는 그 언어(fr)를 남긴다 — 시안 A1 ①′, 코드 자체는 Use this code가 받는다", () => {
    expect(matchesLanguage("fr", "French", "fr-CA")).toBe(true);
    expect(matchesLanguage("de", "German", "fr-CA")).toBe(false);
    expect(matchesLanguage("pt-BR", "Portuguese (Brazil)", "pt-PT")).toBe(false);
  });
});

describe("looksLikeCodeInput — 미리보기를 부를 만큼 코드 모양인가", () => {
  it.each(["fr", "pt-BR", "zh_TW", "fr-CA", "es-419", "KO", "fil"])("%s → 부른다(최종 판정은 서버)", code => {
    expect(looksLikeCodeInput(code)).toBe(true);
  });
  it.each(["", "f", "fr-", "French", "fr CA", "12", "../x", "pt-"])("%s → 부르지 않는다", code => {
    expect(looksLikeCodeInput(code)).toBe(false);
  });
});


describe("Android 프리셋", () => {
  it.each(["-", "_"] as const)("기존 구분자 %s와 무관하게 Android 철자를 낸다", separator => {
    const codes = presetCodes(separator, "android-strings");
    expect(codes).toContain("pt-rBR");
    expect(codes).toContain("zh-rCN");
    expect(codes).toContain("in");
    for (const code of ["pt-BR", "pt_BR", "id"]) expect(codes).not.toContain(code);
    expect(codes).toHaveLength(COMMON_LANGUAGES.length);
  });
  it.each([["he", "iw"], ["id", "in"], ["yi", "ji"], ["he-IL", "iw-rIL"], ["id-ID", "in-rID"], ["yi-US", "ji-rUS"], ["pt-rBR", "pt-rBR"], ["fr", "fr"]])("%s는 레거시 표 뒤 지역 철자를 적용해 %s", (code, expected) => {
    expect(androidResourceCode(code)).toBe(expected);
  });
});
