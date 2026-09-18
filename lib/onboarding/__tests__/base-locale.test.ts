import { describe, expect, it } from "vitest";

import { planBaseLocaleChange } from "../base-locale";

/**
 * 기준 로케일 변경의 순수 판정 (DESIGN §6.66, 6b-3).
 *
 * ⚠️ **`orphaned`를 거부하는 것이 요지다.** 그 로케일 파일은 리포에서 사라졌고(행만 남아 있다),
 * base로 세우면 **다음 push가 그 파일을 못 읽어 키 집합이 0이 된다** — 살아 있던 키 전부가
 * orphaned로 떨어진다. 되돌릴 수는 있지만(플래그다) 편집자가 빈 화면을 본다.
 */
const LOCALES = [
  { code: "en", orphaned: false },
  { code: "ko", orphaned: false },
  { code: "fr", orphaned: true },
];

describe("planBaseLocaleChange", () => {
  it("현재와 같으면 noop — 쓰지 않는다", () => {
    expect(planBaseLocaleChange({ current: "en", next: "en", locales: LOCALES })).toBe("noop");
  });

  it("살아 있는 다른 로케일이면 ok", () => {
    expect(planBaseLocaleChange({ current: "en", next: "ko", locales: LOCALES })).toBe("ok");
  });

  it("목록에 없으면 unknown-locale — 리포에 그 파일이 없다", () => {
    expect(planBaseLocaleChange({ current: "en", next: "ja", locales: LOCALES })).toBe("unknown-locale");
  });

  it("orphaned면 거부한다 — base로 세우면 다음 push가 키 0개를 낸다", () => {
    expect(planBaseLocaleChange({ current: "en", next: "fr", locales: LOCALES })).toBe("orphaned-locale");
  });

  it("로케일 목록이 비면 unknown-locale — 첫 적재 전이다", () => {
    expect(planBaseLocaleChange({ current: "en", next: "ko", locales: [] })).toBe("unknown-locale");
  });

  /**
   * ⚠️ **대소문자·구분자를 접지 않는다.** `DetectedFormat.locales`는 **파일명 그대로**가 진실이고
   * (`lib/adapters/types.ts`의 경고), 어디서든 한 번 정규화하면 write가 존재하지 않는 경로를 만든다.
   */
  it("`zh_CN`과 `zh-CN`은 다른 로케일이다", () => {
    const locales = [{ code: "zh_CN", orphaned: false }];
    expect(planBaseLocaleChange({ current: "en", next: "zh-CN", locales })).toBe("unknown-locale");
    expect(planBaseLocaleChange({ current: "en", next: "zh_CN", locales })).toBe("ok");
  });

  it("현재가 목록에 없어도 next 판정은 독립이다 — 현재가 orphaned가 된 경우", () => {
    expect(planBaseLocaleChange({ current: "ja", next: "ko", locales: LOCALES })).toBe("ok");
  });
});
