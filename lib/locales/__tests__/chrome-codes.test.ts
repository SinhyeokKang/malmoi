import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CHROME_LOCALE_CODES, isChromeLocaleCode } from "../chrome-codes";
import { isLocaleShaped, isPathSafeLocale } from "@/lib/locale-code";
import { compareCodeUnits } from "@/lib/compare";

describe("CHROME_LOCALE_CODES", () => {
  it("holds the 55 documented codes, sorted and unique", () => {
    expect(CHROME_LOCALE_CODES).toHaveLength(55);
    expect(new Set(CHROME_LOCALE_CODES).size).toBe(55);
    expect([...CHROME_LOCALE_CODES].sort(compareCodeUnits)).toEqual([...CHROME_LOCALE_CODES]);
  });

  // 생성 테스트 — 목록의 모든 코드가 추가 입력의 두 검증을 지나야 Add 경로에서 고를 수 있다.
  it.each([...CHROME_LOCALE_CODES])("%s passes isPathSafeLocale and isLocaleShaped", code => {
    expect(isPathSafeLocale(code)).toBe(true);
    expect(isLocaleShaped(code)).toBe(true);
  });

  it("names its source URL and check date in the header comment", () => {
    const source = readFileSync(fileURLToPath(new URL("../chrome-codes.ts", import.meta.url)), "utf8");
    expect(source).toContain("https://developer.chrome.com/docs/extensions/reference/api/i18n#locales");
    expect(source).toContain("2026-10-14");
  });
});

describe("isChromeLocaleCode", () => {
  it.each([
    ["pt_BR", true],
    ["es_419", true],
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
