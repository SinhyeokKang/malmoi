import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CHROME_LOCALE_CODES, isChromeLocaleCode } from "../chrome-codes";
import { isLocaleShaped, isPathSafeLocale } from "@/lib/locale-code";
import { compareCodeUnits } from "@/lib/compare";
import { chromeLocales, localeFromPath } from "@/lib/adapters/chrome-locales";

describe("CHROME_LOCALE_CODES", () => {
  // 문서의 55개에서 `es_419`를 뺐다 — 관측(`looksLikeLocale`)이 숫자 서브태그를 못 읽어 머지 뒤 만료가 orphan시킨다(R-B2 🔴 R2).
  it("holds the 54 observable documented codes, sorted and unique", () => {
    expect(CHROME_LOCALE_CODES).toHaveLength(54);
    expect(new Set(CHROME_LOCALE_CODES).size).toBe(54);
    expect([...CHROME_LOCALE_CODES].sort(compareCodeUnits)).toEqual([...CHROME_LOCALE_CODES]);
  });

  // 생성 테스트 — 목록의 모든 코드가 추가 입력의 두 검증을 지나야 Add 경로에서 고를 수 있다.
  it.each([...CHROME_LOCALE_CODES])("%s passes isPathSafeLocale and isLocaleShaped", code => {
    expect(isPathSafeLocale(code)).toBe(true);
    expect(isLocaleShaped(code)).toBe(true);
  });

  /**
   * **추가 가능 코드 ⊆ 관측 가능 코드** (R-B2 🔴 R2). 추가한 언어는 머지 뒤 base에서 관측돼야 만료가 활성으로 둔다 — 관측은 어댑터 `read`와
   * 같은 `localeFromPath`다. 되읽지 못하는 코드를 받으면 방금 머지한 언어가 orphan으로 숨는다.
   */
  it.each([...CHROME_LOCALE_CODES])("%s round-trips through localeFromPath and chromeLocales.read", code => {
    const template = "ext/_locales/{locale}/messages.json";
    const path = template.replaceAll("{locale}", code);
    expect(localeFromPath(template, path)).toBe(code);
    const read = chromeLocales.read({ adapter: "chrome-locales", pathTemplate: template, locales: [code] }, [{ path, content: '{"a":{"message":"A"}}' }]);
    expect(read.locales.map(l => l.locale)).toEqual([code]);
  });

  it("names its source URL and check date in the header comment", () => {
    const source = readFileSync(fileURLToPath(new URL("../chrome-codes.ts", import.meta.url)), "utf8");
    expect(source).toContain("https://developer.chrome.com/docs/extensions/reference/api/i18n#locales");
    expect(source).toContain("2026-10-14");
    expect(source).toContain("es_419");
  });
});

describe("isChromeLocaleCode", () => {
  it.each([
    ["pt_BR", true],
    // 문서 목록에는 있지만 관측할 수 없어 뺐다(R2).
    ["es_419", false],
    ["fil", true],
    ["en", true],
    // Chrome 디렉터리 이름은 밑줄 표기 그대로다 — 구분자·대소문자가 다르면 다른 디렉터리다.
    ["pt-BR", false],
    ["pt_br", false],
    ["EN", false],
    ["zh_HK", false],
    ["", false],
    ["__proto__", false],
    ["constructor", false],
    ["toString", false],
  ])("%s → %s", (code, expected) => {
    expect(isChromeLocaleCode(code)).toBe(expected);
  });
});
