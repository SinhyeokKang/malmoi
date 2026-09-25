import { describe, expect, it } from "vitest";

import { currentSection } from "@/lib/public-doc/toc";

/**
 * `/privacy` TOC의 현재 절 판정 (시안 `Landing Prototype.dc.html` `isPrivacy` — `offsetTop − 96 <= scrollTop`).
 *
 * 입력은 절 윗변(스크롤러 기준 `offsetTop`) 목록과 스크롤 위치뿐이다 — 같은 위치면 언제나 같은 절이어야
 * 역방향 스크롤에서도 강조가 흔들리지 않는다.
 */
const OFFSETS = [300, 900, 1500] as const;
/** 끝까지 내렸을 때의 scrollTop(`scrollHeight − clientHeight`). 이 테스트의 앞 케이스들은 끝에 닿지 않는다. */
const MAX = 200_000;

describe("currentSection — 스크롤 위치의 절", () => {
  it("첫 절 위에서는 첫 절이다", () => {
    expect(currentSection(OFFSETS, 0, 96, MAX)).toBe(0);
  });

  it("경계 정확히(`offsetTop − 96 === scrollTop`)는 그 절이다", () => {
    expect(currentSection(OFFSETS, 900 - 96, 96, MAX)).toBe(1);
    expect(currentSection(OFFSETS, 900 - 97, 96, MAX)).toBe(0);
  });

  it("절 사이에서는 윗변을 지난 마지막 절이다", () => {
    expect(currentSection(OFFSETS, 1200, 96, MAX)).toBe(1);
  });

  it("마지막 절 아래에서는 마지막 절이다", () => {
    expect(currentSection(OFFSETS, 99_999, 96, MAX)).toBe(2);
  });

  /**
   * ⚠️ **마지막 절이 짧으면 윗변이 `scrollTop + 96`에 영영 못 닿는다** — 1440×900에서 `Changes to this policy`가
   * 끝까지 내려도 강조되지 않았다. 끝에 닿으면 마지막 절이다.
   */
  it("끝까지 내리면 윗변이 기준선에 못 닿아도 마지막 절이다", () => {
    expect(currentSection(OFFSETS, 1200, 96, 1200)).toBe(2);
    expect(currentSection(OFFSETS, 1199.5, 96, 1200)).toBe(2);
    expect(currentSection(OFFSETS, 1198, 96, 1200)).toBe(1);
  });

  it("스크롤할 것이 없으면(끝 = 0) 첫 절이다 — 맨 위가 곧 끝이어도 첫 화면을 마지막 절로 칠하지 않는다", () => {
    expect(currentSection(OFFSETS, 0, 96, 0)).toBe(0);
  });

  it("빈 목록은 0이다", () => {
    expect(currentSection([], 500, 96, MAX)).toBe(0);
  });

  /** 레이아웃 전(폰트 로드 전 등)에 NaN이 섞여도 강조가 사라지거나 튀지 않는다. */
  it("NaN 스크롤 위치는 0이고, NaN 윗변은 건너뛴다", () => {
    expect(currentSection(OFFSETS, Number.NaN, 96, MAX)).toBe(0);
    expect(currentSection([300, Number.NaN, 1500], 1500, 96, MAX)).toBe(2);
    expect(currentSection([300, Number.NaN, 1500], 1000, 96, MAX)).toBe(0);
  });
});
