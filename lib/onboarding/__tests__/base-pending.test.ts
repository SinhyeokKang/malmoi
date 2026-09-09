import { describe, expect, it } from "vitest";

import { basePending } from "../base-pending";

/**
 * 기준 로케일 변경이 **대기 중인가** (design §3.13, 6b-3).
 *
 * ⚠️ **두 화면이 이 함수 하나를 읽는다** — 설정의 `Alert warning`과 번역 화면의 배너. 각자 조건을
 * 쓰면 하나가 낡고, 그때 "경고는 사라졌는데 실제로는 아직 대기 중"이 된다.
 */
describe("basePending", () => {
  it("선언이 없으면 대기가 아니다", () => {
    expect(basePending({ baseLocale: "en", declaredBaseLocale: null })).toBe(false);
  });

  it("선언이 현실과 같으면 대기가 아니다 — 되돌리기가 이 경로다", () => {
    expect(basePending({ baseLocale: "en", declaredBaseLocale: "en" })).toBe(false);
  });

  it("선언이 현실과 다르면 대기다", () => {
    expect(basePending({ baseLocale: "en", declaredBaseLocale: "ko" })).toBe(true);
  });

  /**
   * 첫 push 전이라 현실이 없다. 그때 선언은 **의미가 없다** — 첫 push가 base를 심고,
   * `checkFormat`도 "전부 비어 있으면 통과"라 무엇이든 받는다. 대기로 표시하면 온보딩 중에
   * 경고가 뜬다.
   */
  it("현실이 아직 없으면(첫 push 전) 대기가 아니다", () => {
    expect(basePending({ baseLocale: null, declaredBaseLocale: "ko" })).toBe(false);
    expect(basePending({ baseLocale: null, declaredBaseLocale: null })).toBe(false);
  });
});
