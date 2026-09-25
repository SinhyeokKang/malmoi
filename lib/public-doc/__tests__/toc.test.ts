import { describe, expect, it } from "vitest";

import { currentSection } from "@/lib/public-doc/toc";

/**
 * `/privacy` TOC의 현재 절 판정 (시안 `Landing Prototype.dc.html` `isPrivacy` — `offsetTop − 96 <= scrollTop`).
 *
 * 입력은 절 윗변(스크롤러 기준 `offsetTop`) 목록과 스크롤 위치뿐이다 — 같은 위치면 언제나 같은 절이어야
 * 역방향 스크롤에서도 강조가 흔들리지 않는다.
 */
const OFFSETS = [300, 900, 1500] as const;

describe("currentSection — 스크롤 위치의 절", () => {
  it("첫 절 위에서는 첫 절이다", () => {
    expect(currentSection(OFFSETS, 0, 96)).toBe(0);
  });

  it("경계 정확히(`offsetTop − 96 === scrollTop`)는 그 절이다", () => {
    expect(currentSection(OFFSETS, 900 - 96, 96)).toBe(1);
    expect(currentSection(OFFSETS, 900 - 97, 96)).toBe(0);
  });

  it("절 사이에서는 윗변을 지난 마지막 절이다", () => {
    expect(currentSection(OFFSETS, 1200, 96)).toBe(1);
  });

  it("마지막 절 아래에서는 마지막 절이다", () => {
    expect(currentSection(OFFSETS, 99_999, 96)).toBe(2);
  });

  it("빈 목록은 0이다", () => {
    expect(currentSection([], 500, 96)).toBe(0);
  });

  /** 레이아웃 전(폰트 로드 전 등)에 NaN이 섞여도 강조가 사라지거나 튀지 않는다. */
  it("NaN 스크롤 위치는 0이고, NaN 윗변은 건너뛴다", () => {
    expect(currentSection(OFFSETS, Number.NaN, 96)).toBe(0);
    expect(currentSection([300, Number.NaN, 1500], 1500, 96)).toBe(2);
    expect(currentSection([300, Number.NaN, 1500], 1000, 96)).toBe(0);
  });
});
