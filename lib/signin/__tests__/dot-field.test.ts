import { describe, expect, it } from "vitest";

import { autoCursor, dotGrid, dotScale } from "@/lib/signin/dot-field";

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

describe("autoCursor — 커서가 없을 때의 자동 순회", () => {
  const W = 600;
  const H = 400;
  const SPEED = 300; // px/s
  const ROWS = 3;
  const ACROSS = (W / SPEED) * 1000; // 2000ms — 한 줄
  const STEP = H / (ROWS - 1); // 200px
  const DOWN = (STEP / SPEED) * 1000; // ~667ms — 줄바꿈

  it("첫 줄은 왼쪽에서 오른쪽으로 간다", () => {
    expect(autoCursor(0, W, H, SPEED, ROWS)).toEqual({ x: 0, y: 0 });
    expect(autoCursor(ACROSS / 2, W, H, SPEED, ROWS).x).toBeCloseTo(W / 2);
  });

  /**
   * ⚠️ **줄 사이에 세로 구간이 있다** — 없으면 `y`가 줄 인덱스로만 정해져 줄이 바뀌는 순간
   * 순간이동한다. 그 구간에서 `x`는 방금 끝난 줄의 끝에 머문다(코너가 직각으로 이어진다).
   */
  it("줄바꿈은 세로로 이어진다 — 순간이동하지 않는다", () => {
    const atCorner = autoCursor(ACROSS, W, H, SPEED, ROWS);
    const midDown = autoCursor(ACROSS + DOWN / 2, W, H, SPEED, ROWS);
    const nextRow = autoCursor(ACROSS + DOWN, W, H, SPEED, ROWS);
    // 부동소수 오차가 있다 — 진행률이 1에 수렴하는 지점이라 599.999…가 나온다.
    expect(atCorner.x).toBeCloseTo(W);
    expect(atCorner.y).toBeCloseTo(0);
    expect(midDown.x).toBeCloseTo(W);
    expect(midDown.y).toBeCloseTo(STEP / 2);
    expect(nextRow.y).toBeCloseTo(STEP);
  });

  it("둘째 줄은 오른쪽에서 왼쪽으로 온다", () => {
    const start = autoCursor(ACROSS + DOWN, W, H, SPEED, ROWS);
    const mid = autoCursor(ACROSS + DOWN + ACROSS / 2, W, H, SPEED, ROWS);
    expect(start.x).toBeCloseTo(W);
    expect(mid.x).toBeCloseTo(W / 2);
  });

  /** 경로가 끊기지 않는다 — 촘촘히 샘플링해 한 프레임의 이동 거리가 튀지 않는지 본다. */
  it("경로가 연속이다 — 코너에서 속도가 튀지 않는다", () => {
    const cycle = ROWS * ACROSS + (ROWS - 1) * DOWN;
    let prev = autoCursor(0, W, H, SPEED, ROWS);
    let maxJump = 0;
    for (let t = 16; t <= cycle; t += 16) {
      const now = autoCursor(t, W, H, SPEED, ROWS);
      maxJump = Math.max(maxJump, Math.hypot(now.x - prev.x, now.y - prev.y));
      prev = now;
    }
    // 16ms에 speed(300px/s)로 움직이면 4.8px — 여유를 둬도 두 배를 넘으면 순간이동이다.
    expect(maxJump).toBeLessThan(10);
  });

  it("주기를 돌면 처음으로 돌아온다", () => {
    const cycle = ROWS * ACROSS + (ROWS - 1) * DOWN;
    expect(autoCursor(cycle, W, H, SPEED, ROWS)).toEqual(autoCursor(0, W, H, SPEED, ROWS));
  });

  it("퇴화 입력은 원점이다 — NaN이나 무한 루프를 만들지 않는다", () => {
    expect(autoCursor(1000, 0, H, SPEED, ROWS)).toEqual({ x: 0, y: 0 });
    expect(autoCursor(1000, W, H, 0, ROWS)).toEqual({ x: 0, y: 0 });
    expect(autoCursor(1000, W, H, SPEED, 0)).toEqual({ x: 0, y: 0 });
  });

  /** 줄이 하나면 `(rows - 1)`이 0이라 나눗셈이 무너진다 — 세로 중앙으로 접는다. */
  it("한 줄이면 세로 중앙이다", () => {
    expect(autoCursor(0, W, H, SPEED, 1).y).toBe(H / 2);
  });
});
