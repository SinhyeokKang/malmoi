import { describe, expect, it } from "vitest";

import { FLAG_INVENTORY, flagFor } from "../flag";

/**
 * 로케일 코드 → 국기 파일 id (8-4 T1 — spec Q4).
 *
 * ⚠️ **매핑은 원리적으로 실패한다** — 언어와 국가는 같은 축이 아니다. 그래서 이 테스트가 고정하는
 * 것은 성공 사례가 아니라 **실패했을 때 무엇을 내는가**(`null` = 코드만 그린다)이다.
 *
 * ⚠️ **보유 목록을 인자로 받는다** — 그래야 에셋이 도착하기 전에도 매핑 규칙 자체를 잴 수 있다.
 * 기본값은 리포 상수이고 그것과 `public/flags/`의 대조는 `flag-assets.test.ts`가 든다.
 */
const HAVE = ["kr", "gb", "jp", "cn", "fr"];

describe("flagFor — 하위태그가 먼저다", () => {
  it("지역 하위태그의 국기가 있으면 그것이 이긴다", () => {
    expect(flagFor("zh-CN", HAVE)).toBe("cn");
  });

  /** ⚠️ `_`와 `-`를 같게 본다 — 리포 파일명이 둘 다 쓴다(`planBaseLocaleChange`가 이미 겪었다). */
  it("`zh_CN`과 `zh-CN`이 같다", () => {
    expect(flagFor("zh_CN", HAVE)).toBe(flagFor("zh-CN", HAVE));
  });

  it("대소문자를 무시한다 — `ZH-cn`도 같다", () => {
    expect(flagFor("ZH-cn", HAVE)).toBe("cn");
  });

  it("하위태그의 국기가 없으면 언어 표로 내려간다", () => {
    // `fr-CA`의 `ca`는 보유 목록에 없다 — 언어 `fr`이 답한다.
    expect(flagFor("fr-CA", HAVE)).toBe("fr");
  });
});

describe("flagFor — 명시 표", () => {
  /** ⚠️ `en → gb`는 시안의 선택이고 알고리즘이 낼 수 있는 답이 아니다. */
  it("`en`은 `gb`다 — 표에만 담긴다", () => {
    expect(flagFor("en", HAVE)).toBe("gb");
  });

  it("`ko`는 `kr`, `ja`는 `jp`다 — 코드와 국가가 다른 자리다", () => {
    expect(flagFor("ko", HAVE)).toBe("kr");
    expect(flagFor("ja", HAVE)).toBe("jp");
  });
});

describe("flagFor — `null` 갈래 (폴백은 코드만이다)", () => {
  it("국가가 없는 언어는 `null`이다 — 물음표·지구본을 그리지 않는다", () => {
    expect(flagFor("ar", HAVE)).toBeNull();
  });

  it("리포에서 오는 임의 문자열은 `null`이다", () => {
    expect(flagFor("weird", HAVE)).toBeNull();
    expect(flagFor("", HAVE)).toBeNull();
  });

  /** ⚠️ 표에 있어도 **파일이 없으면** `null`이다 — 배경이 조용히 비는 것을 막는다. */
  it("표엔 있는데 보유 목록에 없으면 `null`이다", () => {
    expect(flagFor("ko", [])).toBeNull();
    expect(flagFor("ko", ["gb"])).toBeNull();
  });

  /** ⚠️ 로케일 코드는 남이 정한 값이다 — 조회가 프로토타입을 타면 `[object Object]`가 나온다. */
  it("`__proto__`·`constructor`가 갈래로 새지 않는다", () => {
    expect(flagFor("__proto__", HAVE)).toBeNull();
    expect(flagFor("constructor", HAVE)).toBeNull();
    expect(flagFor("toString", HAVE)).toBeNull();
  });
});

describe("보유 목록", () => {
  /**
   * ⚠️ **비어 있어도 green이다** — 에셋(T0)이 사용자에게서 오고, 그 전까지 화면은 코드만으로 선다.
   * 이 검사가 고정하는 것은 목록이 **파일 id 모양**이라는 것뿐이다.
   */
  it("소문자 두 글자만 든다", () => {
    for (const id of FLAG_INVENTORY) expect(id).toMatch(/^[a-z]{2}$/);
  });

  it("기본 인자가 그 목록이다 — 호출부가 매번 넘기지 않는다", () => {
    expect(flagFor("ko")).toBe(FLAG_INVENTORY.includes("kr") ? "kr" : null);
  });
});
