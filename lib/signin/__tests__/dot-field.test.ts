import { describe, expect, it } from "vitest";

import { dotGrid, dotScale } from "@/lib/signin/dot-field";

/**
 * 로그인 우측 장식의 판정 둘 (8-1b T8 — `features/ui-rework/signin-auth/design.md` §4).
 *
 * **Canvas인 이유가 여기 있다.** 시안은 커서 주변 도트가 스케일하는데, 지금 도트는
 * `background-image: radial-gradient`라 **개별 도트가 요소가 아니다** — 스케일 대상이 없다.
 * DOM으로 그리면 948×1064 / 16px ≈ **4,000개 요소**라 리페인트로 죽는다.
 *
 * ⚠️ **렌더는 이 파일의 대상이 아니다** — `ctx.arc()` 호출은 I/O다. 여기가 고정하는 것은
 * **좌표와 반지름 계산**까지이고, 그리기·rAF·DPR은 실물 확인의 몫이다.
 *
 * ⚠️ **잎이어야 한다** (import 0) — `components/signin/dot-field.tsx`가 `"use client"`이고
 * `components/__tests__/client-graph.test.ts`가 그 그래프를 센다.
 */
describe("dotGrid — 캔버스 크기 → 도트 좌표", () => {
  /** 시안 값: 간격 16 · 지름 4. 작은 캔버스로 개수와 좌표를 눈으로 셀 수 있게 잰다. */
  it("gap 간격으로 격자를 만든다", () => {
    expect(dotGrid(48, 32, 16)).toEqual([
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 32, y: 0 },
      { x: 48, y: 0 },
      { x: 0, y: 16 },
      { x: 16, y: 16 },
      { x: 32, y: 16 },
      { x: 48, y: 16 },
      { x: 0, y: 32 },
      { x: 16, y: 32 },
      { x: 32, y: 32 },
      { x: 48, y: 32 },
    ]);
  });

  /**
   * ⚠️ **경계를 포함하는 것이 이 함수의 계약이다.** 안 포함하면 캔버스 오른쪽·아래에
   * gap만큼의 빈 띠가 생기고, 그 띠는 패널 가장자리라 **눈에 띄는 자리**다.
   */
  it("폭이 gap의 배수면 마지막 열·행을 포함한다", () => {
    const grid = dotGrid(32, 16, 16);
    expect(grid.some((d) => d.x === 32)).toBe(true);
    expect(grid.some((d) => d.y === 16)).toBe(true);
  });

  it("gap의 배수가 아니면 넘어가는 좌표를 만들지 않는다", () => {
    const grid = dotGrid(40, 40, 16);
    expect(Math.max(...grid.map((d) => d.x))).toBe(32);
    expect(Math.max(...grid.map((d) => d.y))).toBe(32);
  });

  /**
   * ⚠️ **gap이 0·음수면 빈 배열이다.** 무한 루프가 나는 형태를 만들지 않는다 — 이 함수는
   * `ResizeObserver` 콜백에서 불리므로 그 한 번이 탭을 얼린다.
   */
  it("퇴화 입력은 빈 배열이다 — 무한 루프를 만들지 않는다", () => {
    expect(dotGrid(48, 32, 0)).toEqual([]);
    expect(dotGrid(48, 32, -16)).toEqual([]);
    expect(dotGrid(0, 0, 16)).toEqual([{ x: 0, y: 0 }]);
    expect(dotGrid(-10, -10, 16)).toEqual([]);
  });

  it("결정적이다 — 같은 입력이 같은 배열을 낸다", () => {
    expect(dotGrid(64, 48, 16)).toEqual(dotGrid(64, 48, 16));
  });
});

describe("dotScale — 커서 거리 → 반지름", () => {
  const BASE = 2;
  const MAX = 3.5;
  const RADIUS = 180;

  it("커서 바로 아래가 가장 크다", () => {
    expect(dotScale(0, RADIUS, BASE, MAX)).toBe(MAX);
  });

  /** 반경 밖은 기본 크기다 — 그래야 커서가 없는 영역이 시안의 정적 도트와 같아진다. */
  it("반경 밖은 기본 크기다", () => {
    expect(dotScale(RADIUS, RADIUS, BASE, MAX)).toBe(BASE);
    expect(dotScale(RADIUS * 2, RADIUS, BASE, MAX)).toBe(BASE);
  });

  it("중간값은 둘 사이에 있다", () => {
    const mid = dotScale(RADIUS / 2, RADIUS, BASE, MAX);
    expect(mid).toBeGreaterThan(BASE);
    expect(mid).toBeLessThan(MAX);
  });

  /** 단조가 아니면 커서 주위에 링이 생겨 "따라온다"로 안 보인다. */
  it("거리가 멀수록 작아진다 — 단조", () => {
    const samples = [0, 30, 60, 90, 120, 150, 180].map((d) => dotScale(d, RADIUS, BASE, MAX));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]!);
    }
  });

  /** 반경이 0이면 나눗셈이 무너진다 — 전부 기본 크기로 접는다. */
  it("반경 0은 기본 크기다 — NaN을 내지 않는다", () => {
    expect(dotScale(0, 0, BASE, MAX)).toBe(BASE);
    expect(dotScale(10, 0, BASE, MAX)).toBe(BASE);
  });
});
