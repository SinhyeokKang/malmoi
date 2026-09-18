import { describe, expect, it } from "vitest";

import { baseLocaleFieldValue, basePending } from "../base-pending";

/**
 * 기준 로케일 변경이 **대기 중인가** (ARCHITECTURE §5.5.5, 6b-3).
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

/**
 * **설정 화면의 기준 언어 필드가 무엇을 보여야 하는가** (malmoi#20 회귀).
 *
 * ⚠️ **현실을 보이면 저장 한 번이 대기 중인 변경을 조용히 취소한다.** 처음 구현은 필드를
 * `Project.baseLocale`(현실)로 초기화했다 — 그러면 대기 중에 화면을 새로 열면 필드가 옛 언어를
 * 보이고 **바로 아래 배너는 새 언어를 말한다.** 그 상태에서 브랜치만 고쳐 저장하면 옛 언어가
 * "사용자가 고른 값"으로 서버에 가고, `planBaseLocaleChange`가 그것을 `noop`으로 읽어
 * **되돌리기 경로가 선언을 지운다.** 아무 문구도 취소를 말하지 않는다 (실측 2026-09-09).
 *
 * 되돌리기 자체는 옳다 — 틀린 것은 "사용자가 현실을 다시 골랐다"는 전제다.
 * 필드가 선언을 보이면 그 전제가 참이 된다: 되돌리려면 **실제로** 옛 언어를 골라야 한다.
 */
describe("baseLocaleFieldValue", () => {
  it("선언이 있으면 선언을 보인다 — 저장이 보낼 값과 화면이 같아진다", () => {
    expect(baseLocaleFieldValue({ baseLocale: "en", declaredBaseLocale: "ko" })).toBe("ko");
  });

  it("선언이 없으면 현실을 보인다", () => {
    expect(baseLocaleFieldValue({ baseLocale: "en", declaredBaseLocale: null })).toBe("en");
  });

  it("선언과 현실이 같으면 그 값이다 — 대기가 아니다", () => {
    expect(baseLocaleFieldValue({ baseLocale: "en", declaredBaseLocale: "en" })).toBe("en");
  });

  /** 첫 push 전. `basePending`은 false이고 필드도 고를 것이 없다 — 화면이 폼을 disabled로 둔다. */
  it("현실이 없으면 선언을, 둘 다 없으면 null이다", () => {
    expect(baseLocaleFieldValue({ baseLocale: null, declaredBaseLocale: "ko" })).toBe("ko");
    expect(baseLocaleFieldValue({ baseLocale: null, declaredBaseLocale: null })).toBeNull();
  });

  /**
   * ⚠️ **`basePending`과 같은 입력을 받지만 답이 다르다.** 둘을 한 함수로 합치면 "대기인가"와
   * "무엇을 보일까"가 섞이고, 그때 필드가 대기 중에만 선언을 보이는 식의 절반짜리 규칙이 생긴다.
   */
  it("`basePending`이 false인 조합에서도 값은 정의된다", () => {
    const input = { baseLocale: "en", declaredBaseLocale: "en" } as const;
    expect(basePending(input)).toBe(false);
    expect(baseLocaleFieldValue(input)).toBe("en");
  });
});
