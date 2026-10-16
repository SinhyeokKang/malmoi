import { describe, expect, it } from "vitest";

import { nextVisible, REVEAL_STEP, visibleToInclude } from "../reveal";

/**
 * `/changelog`의 10개 단위 드러내기 (changelog-pagination design §3). 서버가 전 목록을 렌더하고 클라이언트는 숨김만 푼다 —
 * 여기는 "몇 개가 보이나"의 판정 둘뿐이다. 초기값은 `nextVisible(0, total)`이고 해시를 쓰지 않는다(서버는 해시를 모른다).
 */

describe("REVEAL_STEP", () => {
  it("한 묶음은 10개다", () => {
    expect(REVEAL_STEP).toBe(10);
  });
});

describe("nextVisible", () => {
  it("첫 묶음은 total을 넘지 않는다 — 0·10·11·25", () => {
    expect(nextVisible(0, 0)).toBe(0);
    expect(nextVisible(0, 10)).toBe(10);
    expect(nextVisible(0, 11)).toBe(10);
    expect(nextVisible(0, 25)).toBe(10);
  });

  it("한 번에 10개씩 늘고 끝에서 total에 멈춘다", () => {
    expect(nextVisible(10, 11)).toBe(11);
    expect(nextVisible(10, 25)).toBe(20);
    expect(nextVisible(20, 25)).toBe(25);
    expect(nextVisible(25, 25)).toBe(25);
  });
});

describe("visibleToInclude", () => {
  it("숨은 index는 그 index를 포함하는 묶음 끝까지 편다", () => {
    expect(visibleToInclude(10, 10, 25)).toBe(20);
    expect(visibleToInclude(17, 10, 25)).toBe(20);
    expect(visibleToInclude(19, 10, 25)).toBe(20);
    expect(visibleToInclude(20, 10, 25)).toBe(25);
    expect(visibleToInclude(24, 10, 25)).toBe(25);
    expect(visibleToInclude(10, 10, 11)).toBe(11);
  });

  it("이미 보이는 index는 visible을 그대로 둔다 — 줄이지 않는다", () => {
    expect(visibleToInclude(0, 10, 25)).toBe(10);
    expect(visibleToInclude(9, 10, 25)).toBe(10);
    expect(visibleToInclude(3, 20, 25)).toBe(20);
  });

  it("범위 밖 index는 visible을 그대로 둔다", () => {
    expect(visibleToInclude(25, 10, 25)).toBe(10);
    expect(visibleToInclude(-1, 10, 25)).toBe(10);
    expect(visibleToInclude(0, 0, 0)).toBe(0);
    expect(visibleToInclude(Number.NaN, 10, 25)).toBe(10);
  });
});
