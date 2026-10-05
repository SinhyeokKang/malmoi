import { describe, expect, it } from "vitest";

import { COLOR_SCHEME_COOKIE, COLOR_SCHEMES, parseColorScheme, resolveColorScheme } from "../scheme";

/**
 * 화면 테마(color-scheme) 판정 — **계정 > 기기 쿠키 > system**. OS 설정은 입력에 없다(서버는 모르고, System의 해석은 CSS가 한다).
 * 쿠키·DB 값은 남이 정한 값이라 지원 집합 밖의 값은 다음 층으로 넘긴다(design §3.3).
 */
describe("COLOR_SCHEMES", () => {
  it("지원 집합은 system · light · dark 셋이다 — sonner `theme`의 값 집합과 같다", () => {
    expect(COLOR_SCHEMES).toEqual(["system", "light", "dark"]);
  });

  it("쿠키 이름은 malmoi-color-scheme이다", () => {
    expect(COLOR_SCHEME_COOKIE).toBe("malmoi-color-scheme");
  });
});

describe("parseColorScheme", () => {
  it("지원 값 셋을 그대로 통과시킨다", () => {
    for (const value of COLOR_SCHEMES) expect(parseColorScheme(value)).toBe(value);
  });

  it("지원하지 않는 값·프로토타입 키·대소문자 변형·문자열 아닌 값은 null이다", () => {
    for (const raw of ["blue", "", "__proto__", "constructor", "toString", "hasOwnProperty", "Dark", " dark", "LIGHT", 0, 1, null, undefined, {}, ["dark"]]) {
      expect(parseColorScheme(raw), String(raw)).toBeNull();
    }
  });
});

describe("resolveColorScheme", () => {
  const cases: Array<[account: unknown, cookie: unknown, expected: string]> = [
    ["dark", "light", "dark"], // 계정이 쿠키를 이긴다 — 다른 기기에서도 같은 테마
    ["system", undefined, "system"],
    [null, "dark", "dark"], // 계정이 비면 쿠키
    ["blue", "dark", "dark"], // 계정 값이 지원 밖이면 쿠키로 넘어간다
    [null, "__proto__", "system"], // 둘 다 없거나 깨졌으면 system
    [undefined, undefined, "system"],
  ];
  it.each(cases)("account=%s cookie=%s → %s", (account, cookie, expected) => {
    expect(resolveColorScheme({ account, cookie })).toBe(expected);
  });

  it("입력은 계정·쿠키 둘뿐이다 — OS 설정을 받을 자리가 없다", () => {
    // @ts-expect-error — os는 시그니처에 없다
    expect(resolveColorScheme({ account: null, cookie: null, os: "dark" })).toBe("system");
  });
});
