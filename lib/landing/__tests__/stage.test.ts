import { describe, expect, it } from "vitest";

import { BEZEL, CANVAS_H, CANVAS_W, CHROME_GAP, MIN_PINNED_SCALE, PLAY, STATE_CANVAS_W, fitScale, frame, pinnedSpan, sceneAt, trackHeight, typedPrefix } from "@/lib/landing/stage";

/**
 * 랜딩 스테이지의 수학 (DESIGN §6.615).
 *
 * **스크롤 위치 하나가 씬을 몬다** — 같은 위치면 언제나 같은 프레임이어야 역방향 스크럽이 성립한다.
 * **씬마다 데스크톱 → 태블릿 → 모바일 그릇을 돈다**(2026-10-11 MK1 — design §2). 그릇 폭과 배율은 스크롤로 움직이지만
 * 각 상태의 배율은 크기만의 함수이고(스크롤 구동 확대는 여전히 없다), 캡션 자리는 스크롤과 무관하다.
 */

/** 캡션 한 줄 — 간격 16 + 줄 28. 한 줄에 드는 폭(≥ 약 770)의 chromeHeight다. */
const ONE_LINE = CHROME_GAP + 28;
/** 375 폭 시안(PT6a) — 진행 3 + 8 + 캡션 21 × 2 줄에 간격 16. */
const TWO_LINES = CHROME_GAP + 3 + 8 + 21 * 2;

/** 스크롤러 W×H(= 뷰포트 − 공개 셸 가로 18 · 세로 98). */
const VIEWPORTS = [
  { name: "1280×800", W: 1262, H: 702, scale: 0.6956 },
  { name: "1440×900", W: 1422, H: 802, scale: 0.8066 },
  { name: "1920×1080", W: 1902, H: 982, scale: 0.9986 },
  { name: "2560×1440", W: 2542, H: 1342, scale: 1 },
] as const;

describe("캔버스", () => {
  /** 툴바와 베젤을 포함한 바깥 컨테이너가 16:10이다. */
  it("전체 컨테이너는 1440×900이고 내부 베젤은 8이다", () => {
    expect([CANVAS_W, CANVAS_H, BEZEL]).toEqual([1440, 900, 8]);
  });

  /** spec 고정 — 목업 루트(베젤 안 화면) 1424 · 768 · 375에 베젤 8×2. 높이는 셋 다 900이다(MK1). */
  it("상태 캔버스 폭은 D 1440 · T 784 · M 391이고 루트는 1424 · 768 · 375다", () => {
    expect(STATE_CANVAS_W).toEqual([1440, 784, 391]);
    expect(STATE_CANVAS_W[0]).toBe(CANVAS_W);
    expect(STATE_CANVAS_W.map((w) => w - 2 * BEZEL)).toEqual([1424, 768, 375]);
  });
});

/**
 * #216 — `lg` 이상 회귀 고정. R5 이전 `fitScale`은 캡션 줄을 상수 28(`h-7`)로 두었다(`CHROME_H = 16 + 28`). 블록이 한 줄이면 잰 높이가 다시 28이므로
 * 같은 크기에서 목업 위치가 그때와 바이트로 같아야 한다. 아래 `legacy`는 R5 이전 식 그대로다.
 *
 * ⚠️ **세로가 세 상태의 배율을 다 정하는 창에서만 위치가 같다**(2026-10-11 MK1) — 캡션 자리가 씬에서 가장 큰 상태(M)의 높이라,
 * D가 폭에 묶이는 창(1024×768 · 768×1024)에서는 D가 그 자리의 세로 가운데에 선다. 배율·x는 어느 창에서나 그대로다.
 */
describe("fitScale — 한 줄 캡션은 R5 이전 위치 그대로 (#216)", () => {
  const legacy = (W: number, H: number) => {
    const clampTo = (lo: number, v: number, hi: number) => Math.min(Math.max(v, lo), hi);
    const CHROME_H = 16 + 28;
    const side = clampTo(24, 0.04 * W, 64);
    const v = clampTo(16, 0.02 * H, 32);
    const scale = Math.max(0, Math.min((W - 2 * side) / CANVAS_W, (H - 2 * v - CHROME_H) / CANVAS_H, 1));
    const y = (H - CANVAS_H * scale - CHROME_H) / 2;
    return { scale, x: (W - CANVAS_W * scale) / 2, y, chromeY: y + CANVAS_H * scale + 16 };
  };

  it.each([
    ["1280×800", 1262, 702],
    ["1440×900", 1422, 802],
  ])("%s — 배율 · x · y · chromeY가 같다", (_, W, H) => {
    const fit = fitScale({ W, H, chromeHeight: ONE_LINE });
    const old = legacy(W, H);
    expect({ scale: fit.scale, x: fit.x, y: fit.y, chromeY: fit.chromeY }).toEqual(old);
  });

  it.each([
    ["1024×768", 1006, 670],
    ["768×1024", 750, 926],
  ])("%s — 배율 · x는 같고, D는 M 높이의 자리 안 세로 가운데다", (_, W, H) => {
    const fit = fitScale({ W, H, chromeHeight: ONE_LINE });
    const old = legacy(W, H);
    expect({ scale: fit.scale, x: fit.x }).toEqual({ scale: old.scale, x: old.x });
    const m = fitScale({ W, H, chromeHeight: ONE_LINE, canvasW: STATE_CANVAS_W[2] });
    expect(m.scale).toBeGreaterThan(fit.scale);
    expect(fit.chromeY).toBe(m.chromeY);
    expect(fit.y).toBeCloseTo(m.y + (CANVAS_H * (m.scale - fit.scale)) / 2, 10);
  });
});

describe("fitScale — 크기만이 배율을 정한다", () => {
  it.each(VIEWPORTS)("$name → $scale", ({ W, H, scale }) => {
    expect(fitScale({ W, H, chromeHeight: ONE_LINE }).scale).toBeCloseTo(scale, 4);
  });

  it("배율은 1을 넘지 않는다 — 캔버스 안은 실제 앱 px다", () => {
    expect(fitScale({ W: 4000, H: 3000, chromeHeight: ONE_LINE }).scale).toBe(1);
  });

  it("좌우 여백은 clamp(24, 4%·W, 64)다", () => {
    expect(fitScale({ W: 500, H: 2000, chromeHeight: ONE_LINE }).side).toBe(24);
    expect(fitScale({ W: 1422, H: 802, chromeHeight: ONE_LINE }).side).toBeCloseTo(56.88, 5);
    expect(fitScale({ W: 1902, H: 982, chromeHeight: ONE_LINE }).side).toBe(64);
  });

  /** 세로가 모자라면 폭이 아니라 세로가 배율을 정한다 — 고정 재생 동안 목업이 뷰포트를 넘으면 아래가 잘린다. */
  it.each([ONE_LINE, TWO_LINES, CHROME_GAP + 120])("폭이 넉넉해도 베젤 + 캔버스 + 캡션 블록(chromeHeight %d)이 세로에 들어간다", (chromeHeight) => {
    for (const { W, H } of [...VIEWPORTS, { W: 2542, H: 600 }, { W: 357, H: 569 }]) {
      const f = fitScale({ W, H, chromeHeight });
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.chromeY + (chromeHeight - CHROME_GAP)).toBeLessThanOrEqual(H + 1e-9);
      expect(f.x).toBeGreaterThanOrEqual(f.side - 1e-9);
    }
  });

  it("가로 가운데 · 베젤과 캡션 블록을 합친 덩어리가 세로 가운데다", () => {
    const { scale, x, y, chromeY } = fitScale({ W: 1902, H: 982, chromeHeight: TWO_LINES });
    expect(x).toBeCloseTo((1902 - CANVAS_W * scale) / 2, 10);
    // 위 여백 = 아래 여백: y = (H − 900s − chromeHeight) / 2.
    expect(y).toBeCloseTo((982 - CANVAS_H * scale - TWO_LINES) / 2, 10);
    expect(982 - (chromeY + TWO_LINES - CHROME_GAP)).toBeCloseTo(y, 10);
    // 캡션 블록은 베젤 아래 간격 16에서 시작한다 — 간격은 chromeHeight에 이미 들어 있다.
    expect(chromeY).toBeCloseTo(y + CANVAS_H * scale + CHROME_GAP, 10);
  });

  /** 캡션이 여러 줄이면 세로 예산이 줄어 배율이 작아진다 — 높이가 입력이라는 것의 직접 증거다. */
  it("세로가 배율을 정하는 구간에서 chromeHeight가 커지면 배율이 정확히 그만큼 줄어든다", () => {
    const W = 2542;
    const H = 600;
    const one = fitScale({ W, H, chromeHeight: ONE_LINE });
    const two = fitScale({ W, H, chromeHeight: TWO_LINES });
    expect(two.scale).toBeLessThan(one.scale);
    expect(one.scale).toBeCloseTo((H - 2 * 16 - ONE_LINE) / CANVAS_H, 10);
    expect(two.scale).toBeCloseTo((H - 2 * 16 - TWO_LINES) / CANVAS_H, 10);
  });

  it("폭이 배율을 정하는 구간에서는 chromeHeight가 배율을 바꾸지 않는다", () => {
    const a = fitScale({ W: 357, H: 2000, chromeHeight: ONE_LINE });
    const b = fitScale({ W: 357, H: 2000, chromeHeight: TWO_LINES });
    expect(a.scale).toBe(b.scale);
    expect(a.scale).toBeCloseTo((357 - 48) / CANVAS_W, 10);
  });

  it("패널이 여백보다 작으면 배율은 0이다 — 음수 배율이 거울상을 그리지 않는다", () => {
    expect(fitScale({ W: 40, H: 40, chromeHeight: ONE_LINE }).scale).toBe(0);
  });

  it("높이가 캡션 블록도 못 담으면 배율은 0이다", () => {
    expect(fitScale({ W: 1422, H: 60, chromeHeight: TWO_LINES }).scale).toBe(0);
  });

  /** 0이거나 비정상인 치수는 NaN·Infinity·음수를 DOM에 쓰지 않는다 — transform 문자열이 통째로 무효가 된다. */
  it.each([
    { name: "W 0", W: 0, H: 800, chromeHeight: ONE_LINE },
    { name: "H 0", W: 1200, H: 0, chromeHeight: ONE_LINE },
    { name: "chromeHeight 0", W: 1200, H: 800, chromeHeight: 0 },
    { name: "W NaN", W: Number.NaN, H: 800, chromeHeight: ONE_LINE },
    { name: "H NaN", W: 1200, H: Number.NaN, chromeHeight: ONE_LINE },
    { name: "chromeHeight NaN", W: 1200, H: 800, chromeHeight: Number.NaN },
    { name: "chromeHeight Infinity", W: 1200, H: 800, chromeHeight: Number.POSITIVE_INFINITY },
    { name: "chromeHeight 음수", W: 1200, H: 800, chromeHeight: -50 },
    { name: "W 음수", W: -300, H: 800, chromeHeight: ONE_LINE },
    { name: "W Infinity", W: Number.POSITIVE_INFINITY, H: 800, chromeHeight: ONE_LINE },
  ])("$name → 모든 값이 유한하고 배율은 0..1이다", (input) => {
    const f = fitScale(input);
    for (const value of [f.scale, f.x, f.y, f.chromeY, f.side, f.chromeW]) expect(Number.isFinite(value)).toBe(true);
    expect(f.scale).toBeGreaterThanOrEqual(0);
    expect(f.scale).toBeLessThanOrEqual(1);
  });

  it("같은 입력은 늘 같은 값이다", () => {
    const input = { W: 357, H: 569, chromeHeight: TWO_LINES };
    expect(fitScale(input)).toEqual(fitScale({ ...input }));
  });

  describe("캡션 폭 — 프레임 폭(= 폭만으로 정한 배율의 1440)이 상한이다", () => {
    it("폭이 정한다 — 높이로 배율이 줄어도 캡션 상한은 같다", () => {
      const tall = fitScale({ W: 357, H: 2000, chromeHeight: TWO_LINES });
      const short = fitScale({ W: 357, H: 300, chromeHeight: TWO_LINES });
      expect(tall.chromeW).toBeCloseTo(357 - 48, 10);
      expect(short.chromeW).toBe(tall.chromeW);
    });

    it("1440을 넘지 않는다", () => {
      expect(fitScale({ W: 4000, H: 3000, chromeHeight: ONE_LINE }).chromeW).toBe(CANVAS_W);
    });
  });

  /** 높이 부족 — 고정 재생 대신 같은 5씬을 정적으로 보인다. 판정은 세로가 정한 배율만 본다(좁은 폭은 정적이어도 같은 배율이다). */
  describe("pinnable — 고정 재생이 가능한가", () => {
    it.each(VIEWPORTS)("$name은 고정 재생이다", ({ W, H }) => {
      expect(fitScale({ W, H, chromeHeight: ONE_LINE }).pinnable).toBe(true);
    });

    it("375×812(캡션 두 줄)도 고정 재생이다 — 좁은 폭만으로는 정적이 되지 않는다", () => {
      expect(fitScale({ W: 357, H: 714, chromeHeight: TWO_LINES }).pinnable).toBe(true);
    });

    it("세로가 정한 배율이 하한 아래면 정적이다 — 높이가 같아도 chromeHeight가 커지면 넘어간다", () => {
      const W = 2542;
      const H = 32 + ONE_LINE + CANVAS_H * MIN_PINNED_SCALE + 32;
      expect(fitScale({ W, H, chromeHeight: ONE_LINE }).pinnable).toBe(true);
      expect(fitScale({ W, H, chromeHeight: CHROME_GAP + 100 }).pinnable).toBe(false);
    });

    it("0·비정상 치수는 정적이다 — 그릴 것이 없다", () => {
      expect(fitScale({ W: 1200, H: 0, chromeHeight: ONE_LINE }).pinnable).toBe(false);
      expect(fitScale({ W: 1200, H: Number.NaN, chromeHeight: ONE_LINE }).pinnable).toBe(false);
    });
  });
});

/**
 * **상태마다 배율을 따로 맞춘다**(MK1) — `scale_k = min((W − 2·side) / Wk, (H − 2·v − chrome) / 900, 1)`. 지금 식의 1440을 상태 폭 `Wk`로 바꾼 것이다.
 * 캡션 자리는 씬에서 가장 큰 상태(가장 좁은 M — 배율이 가장 크다)의 높이라, 상태가 바뀌어도 `chromeY`가 튀지 않는다.
 */
describe("fitScale — 상태 폭", () => {
  const fits = (W: number, H: number, chromeHeight: number) => STATE_CANVAS_W.map((canvasW) => fitScale({ W, H, chromeHeight, canvasW }));

  it("canvasW를 안 주면 D(1440)다", () => {
    expect(fitScale({ W: 1006, H: 670, chromeHeight: ONE_LINE })).toEqual(fitScale({ W: 1006, H: 670, chromeHeight: ONE_LINE, canvasW: CANVAS_W }));
  });

  /** MK1a-375 — 357×714 · 캡션 두 줄에서 D 0.215(폭) · T 0.394(폭) · M 0.681(세로). */
  it("375 페이지 — D·T는 폭이, M은 세로가 정한다", () => {
    const [d, t, m] = fits(357, 714, TWO_LINES);
    expect(d?.scale).toBeCloseTo(309 / 1440, 10);
    expect(t?.scale).toBeCloseTo(309 / 784, 10);
    expect(m?.scale).toBeCloseTo((714 - 2 * 16 - TWO_LINES) / CANVAS_H, 10);
    expect([d?.scale, t?.scale, m?.scale].map((v) => Number(v?.toFixed(3)))).toEqual([0.215, 0.394, 0.681]);
  });

  /** MK1a — 1280×800은 세로가 셋 다 정해 폭만 줄어든다. */
  it("1280×800 — 세 상태가 같은 배율이고 x만 다르다", () => {
    const [d, t, m] = fits(1262, 702, ONE_LINE);
    expect(t?.scale).toBe(d?.scale);
    expect(m?.scale).toBe(d?.scale);
    expect(t?.x).toBeCloseTo((1262 - 784 * (d?.scale ?? 0)) / 2, 10);
    expect(m?.x).toBeCloseTo((1262 - 391 * (d?.scale ?? 0)) / 2, 10);
  });

  it.each([
    [357, 714, TWO_LINES],
    [750, 926, ONE_LINE],
    [1006, 670, ONE_LINE],
    [1262, 702, ONE_LINE],
    [2542, 1342, ONE_LINE],
  ])("%d×%d — 캡션 자리(chromeY)·폭 상한·pinnable이 상태와 무관하고, 각 상태는 M 높이의 자리 안 가운데·가로 가운데다", (W, H, chromeHeight) => {
    const all = fits(W, H, chromeHeight);
    const m = all[2];
    if (!m) throw new Error("M");
    const slotTop = m.y;
    for (const [k, f] of all.entries()) {
      expect(f.chromeY).toBe(m.chromeY);
      expect(f.chromeW).toBe(m.chromeW);
      expect(f.pinnable).toBe(m.pinnable);
      expect(f.scale).toBeLessThanOrEqual(m.scale);
      expect(f.x).toBeCloseTo((W - (STATE_CANVAS_W[k] ?? 0) * f.scale) / 2, 10);
      expect(f.y).toBeCloseTo(slotTop + (CANVAS_H * (m.scale - f.scale)) / 2, 10);
      expect(f.x).toBeGreaterThanOrEqual(f.side - 1e-9);
    }
    // 자리 + 캡션 블록 덩어리가 세로 가운데다.
    expect(H - (m.chromeY + chromeHeight - CHROME_GAP)).toBeCloseTo(slotTop, 10);
    expect(slotTop).toBeGreaterThanOrEqual(0);
  });
});

describe("재생 구간 — 스테이지가 뷰포트를 가진 동안만 씬이 움직인다", () => {
  it("고정 구간은 lead + 씬 다섯 × perScene(H 단위)이고, 트랙은 거기에 H 하나를 더한다", () => {
    expect(pinnedSpan()).toBe(PLAY.lead + 5 * PLAY.perScene);
    expect(trackHeight(800)).toBe(800 * (1 + pinnedSpan()));
  });

  /** MK1 — 1이면 정지 하나가 0.18 H라 휠 한 번에 지나간다(2026-10-11 사용자 수용 — 고정 구간 5 H → 7.5 H). */
  it("기본값은 lead 0 · 씬당 1.5H다 — 조정은 이 두 값이다", () => {
    expect(PLAY).toEqual({ lead: 0, perScene: 1.5 });
    expect(pinnedSpan()).toBe(7.5);
  });
});

describe("sceneAt — 씬 번호 · 진행도 · 그릇 상태", () => {
  const T = 100;
  const H = 1000;
  /** 씬 i의 위치 f(0..1)에 해당하는 scrollTop. */
  const pos = (i: number, f: number) => T + (PLAY.lead + (i + f) * PLAY.perScene) * H;
  const D = 0;
  const TAB = 1;
  const M = 2;

  it("고정 시작은 씬 ①의 D 정지 맨 앞이다", () => {
    expect(sceneAt(T, T, H)).toEqual({ i: 0, f: 0, t: 0, h: 0, device: { from: D, to: D, u: 0 } });
  });

  it("고정 전(목업이 올라오는 중)에도 씬 ①의 D다", () => {
    expect(sceneAt(0, T, H)).toEqual({ i: 0, f: 0, t: 0, h: 0, device: { from: D, to: D, u: 0 } });
  });

  /** D 정지 .18 · D→T .10 · T 정지 .18 · T→M .10 · M 정지 .18 · 교차(M 폭) .13 · M→D .13. */
  it.each([
    [0.1, D, D, 0],
    [0.23, D, TAB, 0.5],
    [0.37, TAB, TAB, 0],
    [0.51, TAB, M, 0.5],
    [0.65, M, M, 0],
    [0.805, M, M, 0],
    [0.935, M, D, 0.5],
  ])("f %d — 그릇 %d → %d, 전환 진행 %d", (f, from, to, u) => {
    const at = sceneAt(pos(1, f), T, H);
    expect(at.i).toBe(1);
    expect(at.device.from).toBe(from);
    expect(at.device.to).toBe(to);
    expect(at.device.u).toBeCloseTo(u, 9);
  });

  it("구간 경계 — 직전은 앞 구간의 끝, 직후는 다음 구간의 맨 앞이다", () => {
    const e = 1e-6;
    expect(sceneAt(pos(0, 0.18 - e), T, H).device).toEqual({ from: D, to: D, u: 0 });
    expect(sceneAt(pos(0, 0.18 + e), T, H).device.to).toBe(TAB);
    expect(sceneAt(pos(0, 0.28 - e), T, H).device.u).toBeCloseTo(1, 4);
    expect(sceneAt(pos(0, 0.28 + e), T, H).device).toEqual({ from: TAB, to: TAB, u: 0 });
    expect(sceneAt(pos(0, 0.56 + e), T, H).device).toEqual({ from: M, to: M, u: 0 });
    expect(sceneAt(pos(0, 0.87 - e), T, H).device).toEqual({ from: M, to: M, u: 0 });
    expect(sceneAt(pos(0, 0.87 + e), T, H).device.to).toBe(D);
  });

  it("다음 씬 교차는 M 폭에서 .74 → .87에 일어나고, 복귀 구간에서는 끝나 있다", () => {
    expect(sceneAt(pos(0, 0.7), T, H).t).toBe(0);
    expect(sceneAt(pos(0, 0.805), T, H).t).toBeCloseTo(0.5, 9);
    expect(sceneAt(pos(0, 0.9), T, H).t).toBe(1);
    expect(sceneAt(pos(0, 0.999), T, H).t).toBe(1);
  });

  it("씬 경계 — 직전은 이전 씬의 M → D 복귀 끝, 직후는 다음 씬의 D 정지 맨 앞", () => {
    const before = sceneAt(pos(0, 0.999), T, H);
    expect(before.i).toBe(0);
    expect(before.device.from).toBe(M);
    expect(before.device.to).toBe(D);
    expect(before.device.u).toBeCloseTo(0.9923, 3);
    const after = sceneAt(pos(1, 0), T, H);
    expect(after.i).toBe(1);
    expect(after.f).toBeCloseTo(0, 9);
    expect(after.t).toBe(0);
    expect(after.device).toEqual({ from: D, to: D, u: 0 });
  });

  /** ② 타이핑 · ③ 배지는 D 정지 시작부터 M 정지 끝(0 → .74)에 걸친다 — 그릇이 좁아지는 동안에도 쳐진다. */
  it("씬 안 진행도 h는 0 → .74에 걸치고 그 뒤로 1이다", () => {
    expect(sceneAt(pos(2, 0.37), T, H).h).toBeCloseTo(0.5, 9);
    expect(sceneAt(pos(2, 0.74 + 1e-6), T, H).h).toBe(1);
    expect(sceneAt(pos(2, 0.9), T, H).h).toBe(1);
  });

  it("마지막 씬 ⑤는 교차·복귀가 없다 — .56부터 끝까지 M 정지다", () => {
    for (const f of [0.6, 0.8, 0.9, 0.99]) {
      const last = sceneAt(pos(4, f), T, H);
      expect(last.i).toBe(4);
      expect(last.t).toBe(0);
      expect(last.device).toEqual({ from: M, to: M, u: 0 });
    }
    expect(sceneAt(pos(4, 0.51), T, H).device.to).toBe(M);
  });

  /** 고정이 풀리는 순간(u = 7.5)에 씬 ⑤가 끝나 있어야 CTA가 올라올 때 재생이 멈춰 있다. */
  it("고정 구간 끝과 그 너머는 씬 ⑤의 끝(M)에 머문다 — 인덱스가 5로 넘치지 않는다", () => {
    const end = { i: 4, f: 1, t: 0, h: 1, device: { from: M, to: M, u: 0 } };
    expect(sceneAt(T + pinnedSpan() * H, T, H)).toEqual(end);
    expect(sceneAt(T + 99999, T, H)).toEqual(end);
  });

  it("스크롤러 높이가 0이거나 입력이 NaN이면 씬 ①의 맨 앞이다", () => {
    const start = { i: 0, f: 0, t: 0, h: 0, device: { from: D, to: D, u: 0 } };
    expect(sceneAt(T + 500, T, 0)).toEqual(start);
    expect(sceneAt(Number.NaN, T, H)).toEqual(start);
  });
});

describe("typedPrefix — 타이핑되는 앞부분", () => {
  it("진행도에 비례해 앞에서부터 잘린다", () => {
    expect(typedPrefix("Bonjour", 0)).toBe("");
    expect(typedPrefix("Bonjour", 0.5)).toBe("Bon");
    expect(typedPrefix("Bonjour", 1)).toBe("Bonjour");
  });

  it("진행도는 0..1로 묶인다", () => {
    expect(typedPrefix("Bonjour", -1)).toBe("");
    expect(typedPrefix("Bonjour", 2)).toBe("Bonjour");
  });

  it("빈 문자열은 빈 문자열이다", () => {
    expect(typedPrefix("", 0.5)).toBe("");
  });

  it("코드포인트 단위로 자른다 — 서로게이트 쌍을 반쪽으로 남기지 않는다", () => {
    expect(typedPrefix("a😀b", 2 / 3)).toBe("a😀");
  });
});

describe("frame — 한 스크롤 위치에 한 프레임", () => {
  const W = 1422;
  const H = 802;
  const stageTop = 420;
  const chromeHeight = TWO_LINES;
  const at = (scrollTop: number, reducedMotion = false, height = chromeHeight, size = { W, H }) =>
    frame({ scrollTop, stageTop, W: size.W, H: size.H, chromeHeight: height, reducedMotion });
  /** 씬 i의 위치 f(0..1). */
  const pos = (i: number, f: number, h = H) => stageTop + (PLAY.lead + (i + f) * PLAY.perScene) * h;
  /** 375 페이지 — 세 상태의 배율이 다 달라 보간이 보인다. */
  const NARROW = { W: 357, H: 714 };
  const narrow = (i: number, f: number, reducedMotion = false) => at(pos(i, f, NARROW.H), reducedMotion, TWO_LINES, NARROW);
  const fitsOf = (size: { W: number; H: number }, height = chromeHeight) =>
    STATE_CANVAS_W.map((canvasW) => fitScale({ W: size.W, H: size.H, chromeHeight: height, canvasW }));
  const placement = (f: { canvasW: number; scale: number; x: number; y: number }) => [f.canvasW, f.scale, f.x, f.y];
  const ALL = [0, 0.1, 0.2, 0.23, 0.26, 0.4, 0.5, 0.6, 0.8, 0.9, 0.95].flatMap((f) => [0, 1, 2, 3, 4].map((i) => [i, f] as const));

  it("정지 구간의 배치는 그 상태의 fitScale과 같다 — 식이 두 벌이 아니다", () => {
    for (const size of [{ W, H }, NARROW]) {
      const [d, t, m] = fitsOf(size);
      for (const [f, fit, cw] of [[0.1, d, 1440], [0.37, t, 784], [0.65, m, 391]] as const) {
        const got = at(pos(2, f, size.H), false, chromeHeight, size);
        expect(placement(got)).toEqual([cw, fit?.scale, fit?.x, fit?.y]);
        expect([got.chromeY, got.chromeW, got.pinnable]).toEqual([fit?.chromeY, fit?.chromeW, fit?.pinnable]);
      }
    }
  });

  /** 캡션 자리는 씬에서 가장 큰 상태의 높이다 — 폭과 배율이 바뀌어도 진행 칸과 문장이 튀지 않는다. */
  it("캡션 자리(chromeY)·폭 상한은 스크롤 위치와 무관하다", () => {
    const first = narrow(0, 0);
    for (const [i, f] of ALL) {
      const got = narrow(i, f);
      expect([got.chromeY, got.chromeW]).toEqual([first.chromeY, first.chromeW]);
    }
    for (const top of [0, stageTop / 2, pos(9, 0)]) expect(at(top).chromeY).toBe(at(0).chromeY);
  });

  it("올라오는 중과 고정 시작은 D다", () => {
    const [d] = fitsOf({ W, H });
    for (const top of [0, stageTop / 2, stageTop]) expect(placement(at(top))).toEqual([1440, d?.scale, d?.x, d?.y]);
  });

  /** 폭 `Wk`와 배율을 같은 t로 보간한다(ease). x·y는 그 둘에서 나온다. */
  it("전환 한가운데 — 폭과 배율이 같은 ease로 반씩 · x는 가로 가운데 · y는 자리 안 세로 가운데", () => {
    const [d, t, m] = fitsOf(NARROW);
    if (!d || !t || !m) throw new Error("fits");
    const mid = narrow(1, 0.23);
    expect(mid.canvasW).toBeCloseTo((1440 + 784) / 2, 9);
    expect(mid.scale).toBeCloseTo((d.scale + t.scale) / 2, 9);
    expect(mid.x).toBeCloseTo((NARROW.W - mid.canvasW * mid.scale) / 2, 9);
    expect(mid.y).toBeCloseTo(m.y + (CANVAS_H * (m.scale - mid.scale)) / 2, 9);
    expect(narrow(1, 0.51).canvasW).toBeCloseTo((784 + 391) / 2, 9);
    expect(narrow(1, 0.935).canvasW).toBeCloseTo((391 + 1440) / 2, 9);
    expect(narrow(1, 0.935).scale).toBeCloseTo((m.scale + d.scale) / 2, 9);
  });

  it("ease — 전환 1/4 지점은 선형보다 덜 움직였다", () => {
    const quarter = narrow(0, 0.205);
    expect(quarter.canvasW).toBeCloseTo(1440 - (1440 - 784) * 0.125, 9);
  });

  it("D → T → M에서 폭은 줄고 배율은 줄지 않는다 · 구간 경계에서 끊기지 않는다", () => {
    let prev = narrow(0, 0.17);
    for (let f = 0.17; f <= 0.75; f += 0.005) {
      const got = narrow(0, f);
      expect(got.canvasW).toBeLessThanOrEqual(prev.canvasW + 1e-9);
      expect(got.scale).toBeGreaterThanOrEqual(prev.scale - 1e-9);
      expect(Math.abs(got.canvasW - prev.canvasW)).toBeLessThan(80);
      prev = got;
    }
    const e = 1e-7;
    for (const b of [0.18, 0.28, 0.46, 0.56, 0.87]) {
      expect(narrow(1, b - e).canvasW).toBeCloseTo(narrow(1, b + e).canvasW, 3);
      expect(narrow(1, b - e).scale).toBeCloseTo(narrow(1, b + e).scale, 6);
    }
    // 씬 경계 — 복귀 끝(D)과 다음 씬 D 정지가 이어진다.
    expect(narrow(1, 1 - e).canvasW).toBeCloseTo(narrow(2, 0).canvasW, 3);
  });

  it("마지막 씬 ⑤는 .56부터 끝까지, 그리고 고정이 풀린 뒤에도 M이다", () => {
    const [, , m] = fitsOf({ W, H });
    for (const f of [0.6, 0.8, 0.99]) expect(placement(at(pos(4, f)))).toEqual([391, m?.scale, m?.x, m?.y]);
    expect(at(pos(99, 0)).canvasW).toBe(391);
  });

  it("chromeHeight는 배치만 바꾸고 씬·캡션·진행·그릇 폭은 바꾸지 않는다", () => {
    for (const top of [0, pos(0, 0.3), pos(0, 0.8), pos(1, 0.5), pos(2, 0.95), pos(99, 0)]) {
      const { scale, x, y, chromeY, chromeW, ...rest } = at(top, false, ONE_LINE, NARROW);
      const { scale: s2, x: x2, y: y2, chromeY: c2, chromeW: w2, ...rest2 } = at(top, false, CHROME_GAP + 140, NARROW);
      expect(rest).toEqual(rest2);
      expect(chromeW).toBe(w2);
      expect([scale, x, y, chromeY]).not.toEqual([s2, x2, y2, c2]);
    }
  });

  it("비정상 치수에서도 프레임 값이 유한하다", () => {
    for (const scrollTop of [0, 500, Number.NaN]) {
      const f = frame({ scrollTop, stageTop: 0, W: 0, H: 0, chromeHeight: Number.NaN, reducedMotion: false });
      for (const value of [f.scale, f.x, f.y, f.chromeY, f.chromeW, f.canvasW]) expect(Number.isFinite(value)).toBe(true);
      expect(f.layers).toEqual([1, 0, 0, 0, 0]);
      expect(f.canvasW).toBe(1440);
    }
  });

  it("작은 높이는 pinnable이 아니다 — 정적 흐름 판정은 상태와 무관하다", () => {
    for (const [i, f] of ALL.slice(0, 15)) expect(at(pos(i, f, 200), false, TWO_LINES, { W: 1422, H: 200 }).pinnable).toBe(false);
  });

  /** 역방향 스크럽 — 올렸다 내리면 모든 프레임 값이 같다(이전 프레임·방향을 입력으로 받지 않는다). */
  it("정방향과 역방향이 같은 위치에서 같은 프레임이다", () => {
    const tops = ALL.map(([i, f]) => pos(i, f, NARROW.H));
    const forward = tops.map((top) => at(top, false, TWO_LINES, NARROW));
    const backward = [...tops].reverse().map((top) => at(top, false, TWO_LINES, NARROW)).reverse();
    expect(backward).toEqual(forward);
  });

  it("같은 위치는 같은 프레임이다 — 내려갔다 돌아와도 같다", () => {
    const first = narrow(1, 0.23);
    narrow(3, 0.9);
    narrow(0, 0);
    expect(narrow(1, 0.23)).toEqual(first);
  });

  it("시작 — 씬 ① · 첫 캡션", () => {
    const f = at(0);
    expect(f.layers).toEqual([1, 0, 0, 0, 0]);
    expect(f.caption).toEqual({ index: 0, opacity: 1 });
  });

  it("세 상태의 정지·폭 전환 동안 씬은 그대로다 — 레이어·캡션이 움직이지 않는다", () => {
    for (const f of [0.1, 0.23, 0.37, 0.51, 0.65, 0.73]) {
      const got = at(pos(1, f));
      expect(got.layers).toEqual([0, 1, 0, 0, 0]);
      expect(got.caption).toEqual({ index: 1, opacity: 1 });
      expect(got.segments).toEqual([1, 1, 0, 0, 0]);
    }
  });

  it("교차 한가운데(M 폭) — 두 씬이 반씩 · 캡션은 0에서 다음 문장으로 바뀐다", () => {
    const f = at(pos(0, 0.805));
    expect(f.scene.i).toBe(0);
    expect(f.canvasW).toBe(391);
    [0.5, 0.5, 0, 0, 0].forEach((v, k) => expect(f.layers[k]).toBeCloseTo(v, 9));
    [1, 0.5, 0, 0, 0].forEach((v, k) => expect(f.segments[k]).toBeCloseTo(v, 9));
    expect(f.caption.opacity).toBeCloseTo(0, 9);
  });

  it("교차 뒤 절반은 다음 문장, 앞 절반은 이전 문장이다", () => {
    expect(at(pos(0, 0.82)).caption.index).toBe(1);
    expect(at(pos(0, 0.79)).caption.index).toBe(0);
  });

  it("M → D 복귀 동안은 다음 씬이 다 보인다 — 새 씬이 D로 넓어진다", () => {
    const f = at(pos(0, 0.935));
    expect(f.layers).toEqual([0, 1, 0, 0, 0]);
    expect(f.caption).toEqual({ index: 1, opacity: 1 });
    expect(f.segments).toEqual([1, 1, 0, 0, 0]);
    expect(f.canvasW).toBeGreaterThan(391);
    expect(f.canvasW).toBeLessThan(1440);
  });

  it("끝 — 씬 ⑤ · 진행 칸 전부 참", () => {
    const f = at(pos(99, 0));
    expect(f.layers).toEqual([0, 0, 0, 0, 1]);
    expect(f.segments).toEqual([1, 1, 1, 1, 1]);
    expect(f.caption.index).toBe(4);
  });

  describe("씬 안의 진행 — 0 → .74에 걸친다", () => {
    it("씬 ② 타이핑은 h를 따르고 그릇이 좁아지는 동안에도 쳐지며, 지나간 뒤엔 다 쳐져 있다", () => {
      expect(at(pos(0, 0.5)).typed).toBe(0);
      expect(at(pos(1, 0.37)).typed).toBeCloseTo(0.5, 9);
      expect(at(pos(1, 0.23)).typed).toBeGreaterThan(at(pos(1, 0.1)).typed);
      expect(at(pos(1, 0.8)).typed).toBe(1);
      expect(at(pos(2, 0.1)).typed).toBe(1);
    });

    it("씬 ③ 배지는 h 0.5(f .37)에서 오르고, 지나간 뒤엔 오른 채다", () => {
      expect(at(pos(2, 0.3)).badge).toBe(0);
      expect(at(pos(2, 0.4)).badge).toBe(1);
      expect(at(pos(3, 0.2)).badge).toBe(1);
    });
  });

  describe("prefers-reduced-motion", () => {
    /** 모든 전환을 한가운데에서 끊는다 — D .23 · T .51 · M(이번 씬) .805 · M(다음 씬) .935 · D. */
    it("중간 폭이 한 프레임도 없다 — 그릇 폭과 배치는 언제나 세 상태 중 하나의 fitScale이다", () => {
      const fits = fitsOf(NARROW, TWO_LINES);
      for (let q = 0; q <= 5; q += 0.0125) {
        const got = at(stageTop + q * PLAY.perScene * NARROW.H, true, TWO_LINES, NARROW);
        const k = STATE_CANVAS_W.indexOf(got.canvasW as (typeof STATE_CANVAS_W)[number]);
        expect(k).toBeGreaterThanOrEqual(0);
        const fit = fits[k];
        expect([got.scale, got.x, got.y]).toEqual([fit?.scale, fit?.x, fit?.y]);
      }
    });

    it("폭은 전환 한가운데에서 끊어 바뀐다", () => {
      expect(narrow(1, 0.22, true).canvasW).toBe(1440);
      expect(narrow(1, 0.24, true).canvasW).toBe(784);
      expect(narrow(1, 0.5, true).canvasW).toBe(784);
      expect(narrow(1, 0.52, true).canvasW).toBe(391);
      expect(narrow(1, 0.93, true).canvasW).toBe(391);
      expect(narrow(1, 0.94, true).canvasW).toBe(1440);
    });

    it("씬은 교차 한가운데에서 끊어 바뀐다 — 중간 opacity가 없다", () => {
      expect(at(pos(0, 0.8), true).layers).toEqual([1, 0, 0, 0, 0]);
      expect(at(pos(0, 0.81), true).layers).toEqual([0, 1, 0, 0, 0]);
      expect(at(pos(0, 0.81), true).caption).toEqual({ index: 1, opacity: 1 });
    });

    it("스크롤 길이는 같다 — 씬 번호가 모션 감소와 무관하다", () => {
      for (const [i, f] of ALL) expect(at(pos(i, f), true).scene.i).toBe(at(pos(i, f)).scene.i);
    });

    it("씬 안의 진행도 즉시다 — 타이핑·배지가 씬 맨 앞에서 끝나 있다", () => {
      expect(at(pos(1, 0.02), true).typed).toBe(1);
      expect(at(pos(2, 0.02), true).badge).toBe(1);
    });
  });
});
