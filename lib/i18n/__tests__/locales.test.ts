import { describe, expect, it } from "vitest";

import { flagFor } from "@/lib/keys/flag";

import { UI_LOCALE_FLAGS, UI_LOCALE_NAMES, UI_LOCALES, parseUiLocale, planUiLocaleWrite, resolveUiLocale } from "../locales";

/**
 * 화면 언어(ui-locales) 판정 — **계정 > 기기 쿠키 > en**. `Accept-Language`는 입력에 없다(처음 온 사용자는 항상 영어).
 * 쿠키·DB 값은 남이 정한 값이라 지원 집합 밖의 값은 다음 층으로 넘긴다(spec 완료 조건 6).
 */
describe("parseUiLocale", () => {
  it("지원 값 셋을 그대로 통과시킨다", () => {
    for (const code of ["en", "ko", "es"]) expect(parseUiLocale(code)).toBe(code);
  });

  it("지원하지 않는 값·프로토타입 키·대소문자 변형·문자열 아닌 값은 null이다", () => {
    for (const raw of ["fr", "", "__proto__", "constructor", "toString", "hasOwnProperty", "EN", " en", "en-US", 0, 1, null, undefined, {}, ["en"]]) {
      expect(parseUiLocale(raw), String(raw)).toBeNull();
    }
  });
});

describe("resolveUiLocale", () => {
  const cases: Array<[account: unknown, cookie: unknown, expected: string]> = [
    ["ko", "es", "ko"], // 계정이 이긴다 — 다른 기기에서도 같은 언어
    ["es", undefined, "es"],
    [null, "ko", "ko"], // 계정이 비면 쿠키
    ["fr", "es", "es"], // 계정 값이 지원 밖이면 쿠키로 넘어간다
    [null, "__proto__", "en"], // 둘 다 없거나 깨졌으면 en
    [undefined, undefined, "en"],
  ];
  it.each(cases)("account=%s cookie=%s → %s", (account, cookie, expected) => {
    expect(resolveUiLocale({ account, cookie })).toBe(expected);
  });
});

describe("planUiLocaleWrite", () => {
  it("로그인했으면 계정과 쿠키 둘 다 쓴다 — 로그아웃 뒤에도 그 기기가 같은 언어다", () => {
    expect(planUiLocaleWrite({ signedIn: true })).toEqual({ cookie: true, account: true });
  });

  it("비로그인이면 쿠키만 쓴다", () => {
    expect(planUiLocaleWrite({ signedIn: false })).toEqual({ cookie: true, account: false });
  });
});

describe("UI_LOCALE_NAMES", () => {
  it("언어 이름은 그 언어 자체의 표기(endonym)이고 지원 집합과 키가 같다", () => {
    expect(UI_LOCALE_NAMES).toEqual({ en: "English", ko: "한국어", es: "Español" });
    expect(Object.keys(UI_LOCALE_NAMES).sort()).toEqual([...UI_LOCALES].sort());
  });
});

describe("UI_LOCALE_FLAGS", () => {
  it("en GB · ko KR · es ES — 프로젝트 로케일 판정(`flagFor`)이 그 국기를 고른다", () => {
    expect(Object.fromEntries(UI_LOCALES.map((code) => [code, flagFor(UI_LOCALE_FLAGS[code])]))).toEqual({ en: "gb", ko: "kr", es: "es" });
  });
});
