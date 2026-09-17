import { describe, expect, it } from "vitest";

import { discardFingerprint, sameFingerprint, type DiscardFingerprintInput } from "../fingerprint";

/**
 * 폐기 승인 지문 (design §4.1). 서버가 발급하고 잠금 뒤 재계산해 대조한다 — **상태가 바뀌면 지문이 바뀐다**가
 * 계약의 전부다(만료·HMAC이 없다). 그래서 입력 축마다 "바꾸면 달라진다"를 하나씩 센다.
 */

const BASE: DiscardFingerprintInput = {
  userId: "owner",
  projectId: "p1",
  surfaces: [
    { id: "s1", importRevision: 3, adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" },
    { id: "s2", importRevision: 0, adapterName: "yaml-catalog", pathTemplate: "config/{locale}.yml", baseLocale: "en" },
  ],
  pending: [
    { id: "t1", token: "a" },
    { id: "t2", token: "b" },
  ],
};

describe("discardFingerprint", () => {
  it("같은 상태 → 같은 지문 (결정적)", () => {
    expect(discardFingerprint(BASE)).toBe(discardFingerprint(structuredClone(BASE)));
  });

  it("sha256 hex 하나다 — pending 수와 무관하게 크기가 상수", () => {
    const many = { ...BASE, pending: Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, token: `k${i}` })) };
    expect(discardFingerprint(BASE)).toMatch(/^[0-9a-f]{64}$/);
    expect(discardFingerprint(many)).toHaveLength(64);
  });

  it("목록 순서에 흔들리지 않는다 — DB 조회 순서가 지문을 바꾸면 매번 reconfirm이다", () => {
    const shuffled = { ...BASE, pending: [...BASE.pending].reverse(), surfaces: [...BASE.surfaces].reverse() };
    expect(discardFingerprint(shuffled)).toBe(discardFingerprint(BASE));
  });

  it("[C4] 같은 건수 다른 편집(토큰만 다름) → 다른 지문", () => {
    expect(discardFingerprint({ ...BASE, pending: [{ id: "t1", token: "a" }, { id: "t2", token: "b2" }] })).not.toBe(discardFingerprint(BASE));
  });

  it("[C4] Dialog 뒤 새 저장(셀 추가) → 다른 지문", () => {
    expect(discardFingerprint({ ...BASE, pending: [...BASE.pending, { id: "t3", token: "c" }] })).not.toBe(discardFingerprint(BASE));
  });

  it("[C4] 설정 변경(경로·어댑터·base) → 다른 지문", () => {
    const [first, second] = BASE.surfaces;
    for (const changed of [
      { ...first!, pathTemplate: "locales/{locale}.json" },
      { ...first!, adapterName: "chrome-locales" },
      { ...first!, baseLocale: "ko" },
    ]) {
      expect(discardFingerprint({ ...BASE, surfaces: [changed, second!] })).not.toBe(discardFingerprint(BASE));
    }
  });

  it("[C4] 적용 뒤(importRevision 증가) → 다른 지문 — 성공한 승인은 재사용되지 않는다", () => {
    const [first, second] = BASE.surfaces;
    expect(discardFingerprint({ ...BASE, surfaces: [{ ...first!, importRevision: 4 }, second!] })).not.toBe(discardFingerprint(BASE));
  });

  it("사용자·프로젝트가 다르면 다른 지문", () => {
    expect(discardFingerprint({ ...BASE, userId: "other" })).not.toBe(discardFingerprint(BASE));
    expect(discardFingerprint({ ...BASE, projectId: "p2" })).not.toBe(discardFingerprint(BASE));
  });

  it("구분자 모호성으로 충돌하지 않는다 — id/token 경계가 바뀐 두 입력", () => {
    const a = { ...BASE, pending: [{ id: "t1", token: "a|t2" }] };
    const b = { ...BASE, pending: [{ id: "t1|a", token: "t2" }] };
    expect(discardFingerprint(a)).not.toBe(discardFingerprint(b));
  });
});

describe("sameFingerprint", () => {
  const current = discardFingerprint(BASE);

  it("일치 → true", () => {
    expect(sameFingerprint(current, current)).toBe(true);
  });

  it("승인 없음(null) → false", () => {
    expect(sameFingerprint(null, current)).toBe(false);
  });

  it("다른 지문 → false", () => {
    expect(sameFingerprint(discardFingerprint({ ...BASE, userId: "x" }), current)).toBe(false);
  });

  it("길이가 다른 입력에서 던지지 않고 false — timingSafeEqual은 길이 불일치에 던진다", () => {
    expect(sameFingerprint("abc", current)).toBe(false);
    expect(sameFingerprint("", current)).toBe(false);
  });
});
