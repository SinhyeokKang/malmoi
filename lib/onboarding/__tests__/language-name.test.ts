import { describe, expect, it } from "vitest";

import { languageName } from "../language-name";

/**
 * ③의 기준 언어 행이 코드가 아니라 **언어 이름**을 든다 (2026-09-13 사용자 — 핸드오프 1c).
 *
 * ⚠️ **영어 이름이다.** 처음에는 자국어(`ko` → "한국어")로 냈는데 **브라우저에서 절반만 성립했다**:
 * `Intl.DisplayNames([code])`는 그 로케일 데이터가 없으면 **보는 사람의 시스템 언어**로 떨어져,
 * Chrome(ko)에서 `az-AZ`가 `azərbaycan (아제르바이잔)`이 됐다(같은 코드가 Node에서는
 * `azərbaycan (Azərbaycan)`이다 — 실측 2026-09-13). 팀원마다 다른 화면을 보고, 그 값이 SSR에
 * 실리는 날 hydration이 깨진다. 영어로 고정하면 누가 보든 같고 화면 문구(영어)와도 일관된다.
 */
describe("languageName", () => {
  it("코드를 영어 언어 이름으로 바꾼다", () => {
    expect(languageName("en", "en")).toBe("English");
    expect(languageName("ko", "en")).toBe("Korean");
    expect(languageName("ja", "en")).toBe("Japanese");
  });

  /**
   * ⚠️ **지역·문자 하위태그를 살린다** — 기준 언어는 되돌릴 수 없는 결정이라 구별이 사라지면 안 된다.
   *
   * ⚠️ **이 줄은 CLDR 문자열을 정확히 박는 ICU 카나리아다.** `.nvmrc`가 Vercel의 Node를 따라가므로
   * **Node를 올리면 여기가 붉어질 수 있다** — 버그가 아니라 신호다: 되돌릴 수 없는 결정 화면의 문구가
   * 바뀐 것이므로 눈으로 보고 값을 갱신한다.
   */
  it("지역·문자 하위태그를 구별해 읽는다", () => {
    expect(languageName("pt-BR", "en")).toBe("Brazilian Portuguese");
    expect(languageName("zh-Hans", "en")).not.toBe(languageName("zh-Hant", "en"));
  });

  /** ⚠️ **리포에서 온 임의 문자열이다** — 매핑이 원리적으로 실패하므로 그때는 코드를 그대로 쓴다. */
  it("모르는 코드는 코드 그대로 둔다", () => {
    expect(languageName("zzz", "en")).toBe("zzz");
    expect(languageName("", "en")).toBe("");
    expect(languageName("not a locale", "en")).toBe("not a locale");
  });

  /**
   * **화면 언어로 읽는다**(ui-locales) — ko 화면에 `Korean`·`French`가 나오지 않는다. 표시 언어는 지원 집합 셋뿐이라
   * 위의 "로케일 데이터가 없으면 시스템 언어로 떨어진다"가 성립하지 않는다(en·ko·es 데이터는 Node·브라우저 ICU에 다 있다).
   * ⚠️ CLDR 문자열 카나리아다 — Node를 올려 붉어지면 눈으로 보고 갱신한다.
   */
  it("화면 언어를 넘기면 그 언어의 이름이다", () => {
    expect(["en", "ko", "es", "ja"].map((code) => languageName(code, "ko"))).toEqual(["영어", "한국어", "스페인어", "일본어"]);
    expect(["en", "ko", "es", "ja"].map((code) => languageName(code, "es"))).toEqual(["inglés", "coreano", "español", "japonés"]);
    expect(["en", "ko", "es", "ja"].map((code) => languageName(code, "en"))).toEqual(["English", "Korean", "Spanish", "Japanese"]);
  });

  it("화면 언어마다 표시기를 따로 둔다 — 먼저 부른 언어가 다음 호출을 오염시키지 않는다", () => {
    expect(languageName("ja", "es")).toBe("japonés");
    expect(languageName("ja", "ko")).toBe("일본어");
    expect(languageName("ja", "en")).toBe("Japanese");
  });

  it("모르는 코드는 어느 화면 언어에서도 코드 그대로다", () => {
    for (const uiLocale of ["en", "ko", "es"] as const) {
      expect(languageName("zzz", uiLocale)).toBe("zzz");
      expect(languageName("not a locale", uiLocale)).toBe("not a locale");
      expect(languageName("__proto__", uiLocale)).toBe("__proto__");
    }
  });

  /** ⚠️ **`Object.prototype`의 키가 와도 코드로 떨어진다** — 남이 정한 키다 (CLAUDE.md). */
  it("프로토타입 키에도 안전하다", () => {
    expect(languageName("constructor", "en")).toBe("constructor");
    expect(languageName("__proto__", "en")).toBe("__proto__");
  });
});
