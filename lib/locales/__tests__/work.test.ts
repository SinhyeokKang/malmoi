import { describe, expect, it } from "vitest";

import { deliveredOf, localeWork, parseDeliveredLocaleChanges } from "../work";

describe("parseDeliveredLocaleChanges", () => {
  it("NULL·빈 배열은 전달한 것이 없다", () => {
    expect(parseDeliveredLocaleChanges(null)).toEqual([]);
    expect(parseDeliveredLocaleChanges([])).toEqual([]);
  });

  it("정규형으로 읽는다 — 코드순·중복 제거", () => {
    expect(parseDeliveredLocaleChanges([
      { localeCode: "fr", effect: "create" },
      { localeCode: "de", effect: "delete" },
      { localeCode: "fr", effect: "create" },
    ])).toEqual([{ localeCode: "de", effect: "delete" }, { localeCode: "fr", effect: "create" }]);
  });

  it("모양이 틀린 원소는 버린다 — 다른 버전이 쓴 값이 와도 죽지 않는다", () => {
    expect(parseDeliveredLocaleChanges({ fr: "create" })).toEqual([]);
    expect(parseDeliveredLocaleChanges("fr")).toEqual([]);
    expect(parseDeliveredLocaleChanges([
      null, 1, "fr", [], { localeCode: 3, effect: "create" }, { localeCode: "fr", effect: "rename" }, { localeCode: "", effect: "delete" },
      { localeCode: "ko", effect: "delete" },
    ])).toEqual([{ localeCode: "ko", effect: "delete" }]);
  });

  it("프로토타입에서 찾아진 값을 읽지 않는다 — __proto__ 코드는 평범한 코드다", () => {
    const inherited = Object.create({ localeCode: "fr", effect: "create" }) as object;
    expect(parseDeliveredLocaleChanges([inherited])).toEqual([]);
    expect(parseDeliveredLocaleChanges([{ localeCode: "__proto__", effect: "delete" }])).toEqual([{ localeCode: "__proto__", effect: "delete" }]);
  });
});

describe("deliveredOf", () => {
  it("확인 행이 없으면 전달한 것이 없다", () => {
    expect(deliveredOf(null)).toEqual([]);
  });

  it("무효화 중이면 확인 안 됨(null)이다", () => {
    expect(deliveredOf({ deliveredLocaleChanges: [{ localeCode: "fr", effect: "create" }], invalidatedAt: new Date() })).toBeNull();
  });

  it("유효한 확인은 저장된 목록이다", () => {
    expect(deliveredOf({ deliveredLocaleChanges: [{ localeCode: "fr", effect: "create" }], invalidatedAt: null })).toEqual([{ localeCode: "fr", effect: "create" }]);
    expect(deliveredOf({ deliveredLocaleChanges: null, invalidatedAt: null })).toEqual([]);
  });
});

describe("localeWork", () => {
  it("현재 목록 = 전달 목록이면 작업 0", () => {
    expect(localeWork([{ localeCode: "fr", effect: "create" }], [{ localeCode: "fr", effect: "create" }])).toEqual([]);
    expect(localeWork([], [])).toEqual([]);
  });

  it("전달 전 요청은 언어별 작업이다", () => {
    expect(localeWork([{ localeCode: "de", effect: "delete" }, { localeCode: "fr", effect: "create" }], [])).toEqual([
      { localeCode: "de", current: "delete", delivered: null },
      { localeCode: "fr", current: "create", delivered: null },
    ]);
  });

  it("전달 후 취소는 그 언어의 작업으로 남는다 — 다음 Publish가 정리한다", () => {
    expect(localeWork([], [{ localeCode: "de", effect: "delete" }])).toEqual([{ localeCode: "de", current: null, delivered: "delete" }]);
  });

  it("전달 전 취소는 목록이 돌아가 작업이 저절로 0이다", () => {
    const delivered = [{ localeCode: "fr", effect: "create" as const }];
    expect(localeWork(delivered, delivered)).toEqual([]);
  });

  it("확인 안 됨(null)은 현재 효과 전부를 미전달로 본다", () => {
    expect(localeWork([{ localeCode: "fr", effect: "create" }], null)).toEqual([{ localeCode: "fr", current: "create", delivered: null }]);
    expect(localeWork([], null)).toEqual([]);
  });

  it("코드순이고 __proto__는 평범한 코드다", () => {
    expect(localeWork([{ localeCode: "__proto__", effect: "delete" }, { localeCode: "Es", effect: "delete" }], [{ localeCode: "zh_TW", effect: "create" }]))
      .toEqual([
        { localeCode: "Es", current: "delete", delivered: null },
        { localeCode: "__proto__", current: "delete", delivered: null },
        { localeCode: "zh_TW", current: null, delivered: "create" },
      ]);
  });
});
