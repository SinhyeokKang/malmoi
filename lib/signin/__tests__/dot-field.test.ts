import { describe, expect, it } from "vitest";

import { autoCursor, clampScrollTop, dotGrid, dotScale, partitionDots } from "@/lib/signin/dot-field";

/**
 * 로그인 우측 장식의 판정 둘 (8-1b).
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

/**
 * **랜딩의 스크롤 격자** (landing-kv-background design §3 R6). 캔버스는 한 화면짜리 sticky이고, 격자만 `scrollTop % gap`만큼
 * 올려 그려 점이 콘텐츠에 박힌 것처럼 올라간다. ⚠️ **`offsetY = 0`은 로그인 출력과 같아야 한다** — 로그인은 이 인자를 안 넘긴다.
 */
describe("dotGrid — 세로 오프셋", () => {
  it("offsetY 0(기본값)은 지금 출력과 같다 — 로그인 불변", () => {
    for (const [w, h] of [[48, 32], [40, 40], [0, 0], [100, 37]] as const) {
      expect(dotGrid(w, h, 16, 0)).toEqual(dotGrid(w, h, 16));
    }
  });

  it("첫 행은 -offsetY에서 시작하고 마지막 행은 높이 이상이다 — 아래에 빈 띠가 없다", () => {
    const grid = dotGrid(32, 40, 16, 4);
    const rows = [...new Set(grid.map((d) => d.y))];
    expect(rows).toEqual([-4, 12, 28, 44]);
    expect(Math.max(...rows)).toBeGreaterThanOrEqual(40);
    // 열은 오프셋과 무관하다.
    expect([...new Set(grid.map((d) => d.x))]).toEqual([0, 16, 32]);
  });

  it("높이가 gap의 배수여도 마지막 행이 높이 이상이다", () => {
    const rows = [...new Set(dotGrid(16, 32, 16, 1).map((d) => d.y))];
    expect(rows[0]).toBe(-1);
    expect(Math.max(...rows)).toBeGreaterThanOrEqual(32);
  });

  it("offsetY가 gap의 배수면 원위치와 같다 — 16px 스크롤마다 한 칸", () => {
    expect(dotGrid(48, 40, 16, 16)).toEqual(dotGrid(48, 40, 16));
    expect(dotGrid(48, 40, 16, 32)).toEqual(dotGrid(48, 40, 16));
    expect(dotGrid(48, 40, 16, 16 + 5)).toEqual(dotGrid(48, 40, 16, 5));
  });

  /** ⚠️ Safari 고무줄 스크롤은 `scrollTop`을 음수로 준다 — 나머지가 음수여도 같은 격자 위상이어야 한다. */
  it("음수 오프셋은 같은 위상의 양수로 접는다", () => {
    expect(dotGrid(48, 40, 16, -4)).toEqual(dotGrid(48, 40, 16, 12));
  });

  it("유한하지 않은 오프셋은 0으로 읽는다 — NaN 좌표를 캔버스에 보내지 않는다", () => {
    expect(dotGrid(48, 40, 16, Number.NaN)).toEqual(dotGrid(48, 40, 16));
    expect(dotGrid(48, 40, 16, Number.POSITIVE_INFINITY)).toEqual(dotGrid(48, 40, 16));
  });

  it("퇴화 입력은 오프셋이 있어도 빈 배열이다", () => {
    expect(dotGrid(48, 32, 0, 4)).toEqual([]);
    expect(dotGrid(-10, -10, 16, 4)).toEqual([]);
  });
});

/**
 * **격자 위상에 넘길 스크롤 위치** (landing-kv-background R6). 고무줄 스크롤에서는 `scrollTop`이 `[0, 최대]` 밖으로 나가는데,
 * 그동안 sticky 캔버스는 콘텐츠와 함께 움직인다 — 위 끝에선 같이 내려가고 아래 끝에선 래퍼 바닥에 걸려 같이 올라간다.
 * 그래서 맞는 오프셋은 범위로 자른 값이다. 자르지 않으면 점이 콘텐츠의 두 배 속도로 미끄러진다.
 */
describe("clampScrollTop — 고무줄 스크롤을 범위로 자른다", () => {
  it("범위 안은 그대로다", () => {
    expect(clampScrollTop(0, 2000, 400)).toBe(0);
    expect(clampScrollTop(21, 2000, 400)).toBe(21);
    expect(clampScrollTop(1600, 2000, 400)).toBe(1600);
  });

  it("위 끝 튕김(음수)은 0이다", () => {
    expect(clampScrollTop(-5, 2000, 400)).toBe(0);
  });

  it("아래 끝 튕김(최대 초과)은 최대값이다", () => {
    expect(clampScrollTop(1612, 2000, 400)).toBe(1600);
  });

  it("콘텐츠가 스크롤포트보다 짧으면(최대가 음수) 0이다", () => {
    expect(clampScrollTop(10, 300, 400)).toBe(0);
  });

  it("유한하지 않은 입력은 0으로 읽는다 — NaN을 격자에 보내지 않는다", () => {
    expect(clampScrollTop(Number.NaN, 2000, 400)).toBe(0);
    expect(clampScrollTop(10, Number.NaN, 400)).toBe(0);
    expect(clampScrollTop(10, 2000, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

/**
 * **묶음 그리기의 입력** (design §3 R8). 2560×1440이면 점이 1만 3천 개라, 커서 반경 밖(모두 같은 반지름·알파)은 path 하나로 모아 fill 한 번이다.
 * ⚠️ **`far`의 점은 `dotScale`이 기본값을 내야 한다** — 아니면 묶음 그리기가 점마다 그리기와 다른 픽셀을 낸다.
 */
describe("partitionDots — 커서 반경 안/밖", () => {
  const RADIUS = 20;
  const dots = dotGrid(64, 64, 16);

  it("near ∪ far = dots이고 교집합이 없다", () => {
    const { near, far } = partitionDots(dots, { x: 30, y: 30 }, RADIUS);
    expect(near.length + far.length).toBe(dots.length);
    expect(new Set([...near, ...far])).toEqual(new Set(dots));
    expect(near.filter((d) => far.includes(d))).toEqual([]);
  });

  it("far의 모든 점은 dotScale이 기본값이고 near는 아니다 — 반지름·알파 모두", () => {
    const spot = { x: 30, y: 30 };
    const { near, far } = partitionDots(dots, spot, RADIUS);
    expect(near.length).toBeGreaterThan(0);
    for (const d of far) {
      const distance = Math.hypot(d.x - spot.x, d.y - spot.y);
      expect(dotScale(distance, RADIUS, 2, 3.5)).toBe(2);
      expect(dotScale(distance, RADIUS, 0.08, 0.3)).toBe(0.08);
    }
    for (const d of near) {
      expect(dotScale(Math.hypot(d.x - spot.x, d.y - spot.y), RADIUS, 2, 3.5)).toBeGreaterThan(2);
    }
  });

  it("반경 경계(거리 = radius)는 far다 — dotScale이 거기서 기본값이다", () => {
    const { near, far } = partitionDots([{ x: 20, y: 0 }], { x: 0, y: 0 }, RADIUS);
    expect(near).toEqual([]);
    expect(far).toEqual([{ x: 20, y: 0 }]);
  });

  it("spot이 null이면 전부 far다", () => {
    expect(partitionDots(dots, null, RADIUS)).toEqual({ near: [], far: dots });
  });

  it("반경 0 이하면 전부 far다 — dotScale이 기본값으로 접는 것과 같다", () => {
    expect(partitionDots(dots, { x: 0, y: 0 }, 0).near).toEqual([]);
    expect(partitionDots(dots, { x: 0, y: 0 }, -5).near).toEqual([]);
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

/**
 * **넘침 폭** (landing-kv-autosweep) — 랜딩은 가상 커서가 패널 좌우 밖 `overshoot`까지 가서 줄을 바꾼다. 반경만큼 넘치면 줄바꿈 동안
 * 밝은 원이 패널에서 완전히 빠진다. ⚠️ 로그인은 이 인자를 넘기지 않는다 — 0이면 지금 출력과 바이트 단위로 같아야 한다.
 */
describe("autoCursor — overshoot", () => {
  const W = 600;
  const H = 400;
  const SPEED = 300;
  const ROWS = 3;
  const O = 180;
  const SPAN = W + 2 * O;
  const ACROSS = (SPAN / SPEED) * 1000;
  const STEP = H / (ROWS - 1);
  const DOWN = (STEP / SPEED) * 1000;
  const CYCLE = ROWS * ACROSS + (ROWS - 1) * DOWN;

  it("0이면 인자를 생략한 것과 비트 단위로 같다 — 로그인 불변", () => {
    const plainCycle = ROWS * ((W / SPEED) * 1000) + (ROWS - 1) * DOWN;
    for (let t = 0; t <= plainCycle; t += 7) {
      const plain = autoCursor(t, W, H, SPEED, ROWS);
      const zero = autoCursor(t, W, H, SPEED, ROWS, 0);
      expect(Object.is(plain.x, zero.x) && Object.is(plain.y, zero.y)).toBe(true);
    }
    // 둘째 줄바꿈(왼쪽 끝)의 x는 +0이다 — `-o`로 쓰면 -0이 되어 기존 출력과 갈린다.
    const plainAcross = (W / SPEED) * 1000;
    expect(Object.is(autoCursor(2 * plainAcross + DOWN * 1.5, W, H, SPEED, ROWS, 0).x, 0)).toBe(true);
  });

  it("첫 줄은 x = -o에서 시작해 width + o에서 끝난다", () => {
    expect(autoCursor(0, W, H, SPEED, ROWS, O)).toEqual({ x: -O, y: 0 });
    expect(autoCursor(ACROSS / 2, W, H, SPEED, ROWS, O).x).toBeCloseTo(W / 2);
    expect(autoCursor(ACROSS, W, H, SPEED, ROWS, O).x).toBeCloseTo(W + O);
    // 둘째 줄은 반대로 — width + o에서 -o로.
    expect(autoCursor(ACROSS + DOWN, W, H, SPEED, ROWS, O).x).toBeCloseTo(W + O);
    expect(autoCursor(2 * ACROSS + DOWN, W, H, SPEED, ROWS, O).x).toBeCloseTo(-O);
  });

  it("줄바꿈 구간의 x는 [0, width] 밖이다", () => {
    for (const [from, to] of [[ACROSS, ACROSS + DOWN], [2 * ACROSS + DOWN, 2 * ACROSS + 2 * DOWN]] as const) {
      for (let t = from + 1; t < to; t += 10) {
        const { x } = autoCursor(t, W, H, SPEED, ROWS, O);
        expect(x < 0 || x > W).toBe(true);
      }
    }
  });

  it("한 주기 = rows·(width + 2o)/speed + (rows−1)·step/speed — 주기 끝은 시작으로 돌아온다", () => {
    expect(autoCursor(CYCLE, W, H, SPEED, ROWS, O)).toEqual(autoCursor(0, W, H, SPEED, ROWS, O));
    expect(autoCursor(CYCLE - 1, W, H, SPEED, ROWS, O).y).toBeCloseTo(H);
  });

  it("줄바꿈 동안 반경 안에 드는 점이 0이다 (o = 반경 180)", () => {
    const dots = dotGrid(W, H, 16);
    for (let t = ACROSS + 1; t < ACROSS + DOWN; t += 10) {
      expect(partitionDots(dots, autoCursor(t, W, H, SPEED, ROWS, O), O).near).toEqual([]);
    }
    // 대조 — 줄 한가운데에서는 반경 안 점이 있다.
    expect(partitionDots(dots, autoCursor(ACROSS / 2, W, H, SPEED, ROWS, O), O).near.length).toBeGreaterThan(0);
  });
});
