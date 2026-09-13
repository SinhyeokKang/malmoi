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
    expect(languageName("en")).toBe("English");
    expect(languageName("ko")).toBe("Korean");
    expect(languageName("ja")).toBe("Japanese");
  });

  /**
   * ⚠️ **지역·문자 하위태그를 살린다** — 기준 언어는 되돌릴 수 없는 결정이라 구별이 사라지면 안 된다.
   *
   * ⚠️ **이 줄은 CLDR 문자열을 정확히 박는 ICU 카나리아다.** `.nvmrc`가 Vercel의 Node를 따라가므로
   * **Node를 올리면 여기가 붉어질 수 있다** — 버그가 아니라 신호다: 되돌릴 수 없는 결정 화면의 문구가
   * 바뀐 것이므로 눈으로 보고 값을 갱신한다.
   */
  it("지역·문자 하위태그를 구별해 읽는다", () => {
    expect(languageName("pt-BR")).toBe("Brazilian Portuguese");
    expect(languageName("zh-Hans")).not.toBe(languageName("zh-Hant"));
  });

  /** ⚠️ **리포에서 온 임의 문자열이다** — 매핑이 원리적으로 실패하므로 그때는 코드를 그대로 쓴다. */
  it("모르는 코드는 코드 그대로 둔다", () => {
    expect(languageName("zzz")).toBe("zzz");
    expect(languageName("")).toBe("");
    expect(languageName("not a locale")).toBe("not a locale");
  });

  /** ⚠️ **`Object.prototype`의 키가 와도 코드로 떨어진다** — 남이 정한 키다 (CLAUDE.md). */
  it("프로토타입 키에도 안전하다", () => {
    expect(languageName("constructor")).toBe("constructor");
    expect(languageName("__proto__")).toBe("__proto__");
  });
});
