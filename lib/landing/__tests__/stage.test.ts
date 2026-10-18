import { describe, expect, it } from "vitest";

import {
  BEZEL,
  CANVAS_W,
  CHROME_GAP,
  MIN_PINNED_SCALE,
  PLAY,
  SCREEN_BORDER,
  STATE_CANVAS_H,
  STATE_CANVAS_W,
  deviceForViewport,
  fitScale,
  frame,
  pinnedSpan,
  sceneAt,
  trackHeight,
  typedPrefix,
  type Device,
} from "@/lib/landing/stage";

/**
 * 랜딩 스테이지의 수학 (DESIGN §6.615).
 *
 * **스크롤 위치 하나가 씬을 몬다** — 같은 위치면 언제나 같은 프레임이어야 역방향 스크럽이 성립한다.
 * **그릇(D·T·M)은 뷰포트가 고른다**(2026-10-11 사용자 정정 — mockup-viewport-container). 재생 중 그릇은 바뀌지 않고 다섯 씬이 그 안에서
 * 교차한다. 배율·위치는 크기와 그릇의 함수이고 스크롤과 무관하다(스크롤 구동 확대는 없다).
 */

/** 캡션 한 줄 — 간격 16 + 줄 28. 한 줄에 드는 폭(≥ 약 770)의 chromeHeight다. */
const ONE_LINE = CHROME_GAP + 28;
/** 375 폭 시안(PT6a) — 진행 3 + 8 + 캡션 21 × 2 줄에 간격 16. */
const TWO_LINES = CHROME_GAP + 3 + 8 + 21 * 2;
const DEVICES = [0, 1, 2] as const satisfies readonly Device[];
const D = 0;
const TAB = 1;
const M = 2;

/** 스크롤러 W×H(= 뷰포트 − 공개 셸 가로 16 · 세로 96 — 랜딩 패널은 `kv` 갈래라 테두리가 없다). D 그릇이 서는 뷰포트들이다. */
const VIEWPORTS = [
  { name: "1280×800", W: 1264, H: 704, scale: 0.6978 },
  { name: "1440×900", W: 1424, H: 804, scale: 0.8087 },
  { name: "1920×1080", W: 1904, H: 984, scale: 1 },
  { name: "2560×1440", W: 2544, H: 1344, scale: 1 },
] as const;

describe("캔버스", () => {
  /** 툴바와 베젤을 포함한 D 컨테이너가 16:10이다. */
  it("D 컨테이너는 1440×900이고 내부 베젤은 8이다", () => {
    expect([CANVAS_W, STATE_CANVAS_H[0], BEZEL]).toEqual([1440, 900, 8]);
  });

  /**
   * spec 고정 — 목업 루트(베젤 안 화면의 내용 상자) T 768 · M 375. **루트 = 캔버스 − 18**(베젤 8×2 + 화면 border 1×2 — 2026-10-11 D7).
   * D는 캔버스 1440을 지켜 루트 1422다(1424와 같은 갈래, 씬 좌표 불변).
   */
  it("상태 캔버스 폭은 D 1440 · T 786 · M 393이고 루트는 1422 · 768 · 375다", () => {
    expect(STATE_CANVAS_W).toEqual([1440, 786, 393]);
    expect(STATE_CANVAS_W[0]).toBe(CANVAS_W);
    expect([BEZEL, SCREEN_BORDER]).toEqual([8, 1]);
    expect(STATE_CANVAS_W.map((w) => w - 2 * BEZEL - 2 * SCREEN_BORDER)).toEqual([1422, 768, 375]);
  });

  /** M 776은 검수 뷰포트 375×812·390×844 + 두 줄 캡션에서 폭이 배율을 정하는 최대 높이다(design §1). T는 MK1 틀 그대로 900. */
  it("상태 캔버스 높이는 D 900 · T 900 · M 776이다", () => {
    expect(STATE_CANVAS_H).toEqual([900, 900, 776]);
  });
});

/** 그릇은 뷰포트 `lg`(64rem)·`sm`(40rem) 두 질의의 결과가 고른다 — 1024 D / 1023 T / 640 T / 639 M. */
describe("deviceForViewport — 뷰포트가 그릇을 고른다", () => {
  it.each([
    [true, true, D],
    [false, true, TAB],
    [false, false, M],
    // 모순 조합(lg ∧ ¬sm)은 lg가 이긴다.
    [true, false, D],
  ] as const)("lg %s · sm %s → %d", (isLg, isSm, want) => {
    expect(deviceForViewport(isLg, isSm)).toBe(want);
  });
});

describe("device는 필수 입력이다 — 빠뜨린 호출이 조용히 D가 되지 않는다", () => {
  it("fitScale·frame이 device 없이 타입 오류다", () => {
    // @ts-expect-error device 누락
    expect(() => fitScale({ W: 1422, H: 802, chromeHeight: ONE_LINE })).not.toThrow();
    // @ts-expect-error device 누락
    expect(() => frame({ scrollTop: 0, stageTop: 0, W: 1422, H: 802, chromeHeight: ONE_LINE, reducedMotion: false })).not.toThrow();
  });
});

/**
 * #216 — `lg` 이상 회귀 고정. R5 이전 `fitScale`은 캡션 줄을 상수 28(`h-7`)로 두었다(`CHROME_H = 16 + 28`). 블록이 한 줄이면 잰 높이가 다시 28이므로
 * 같은 크기에서 D 목업 위치가 그때와 바이트로 같아야 한다. 아래 `legacy`는 R5 이전 식 그대로다.
 */
describe("fitScale — D 한 줄 캡션은 R5 이전 위치 그대로 (#216)", () => {
  const legacy = (W: number, H: number) => {
    const clampTo = (lo: number, v: number, hi: number) => Math.min(Math.max(v, lo), hi);
    const CHROME_H = 16 + 28;
    const side = clampTo(24, 0.04 * W, 64);
    const v = clampTo(16, 0.02 * H, 32);
    const scale = Math.max(0, Math.min((W - 2 * side) / 1440, (H - 2 * v - CHROME_H) / 900, 1));
    const y = (H - 900 * scale - CHROME_H) / 2;
    return { scale, x: (W - 1440 * scale) / 2, y, chromeY: y + 900 * scale + 16 };
  };

  it.each([
    ["1280×800", 1264, 704],
    ["1440×900", 1424, 804],
    ["1024×768", 1008, 672],
    ["768×1024", 752, 928],
  ])("%s — 배율 · x · y · chromeY가 같다", (_, W, H) => {
    const fit = fitScale({ W, H, chromeHeight: ONE_LINE, device: D });
    const old = legacy(W, H);
    expect({ scale: fit.scale, x: fit.x, y: fit.y, chromeY: fit.chromeY }).toEqual(old);
  });
});

describe("fitScale — 크기만이 배율을 정한다", () => {
  it.each(VIEWPORTS)("$name → $scale", ({ W, H, scale }) => {
    expect(fitScale({ W, H, chromeHeight: ONE_LINE, device: D }).scale).toBeCloseTo(scale, 4);
  });

  it("배율은 1을 넘지 않는다 — 캔버스 안은 실제 앱 px다", () => {
    for (const device of DEVICES) expect(fitScale({ W: 4000, H: 3000, chromeHeight: ONE_LINE, device }).scale).toBe(1);
  });

  it("좌우 여백은 clamp(24, 4%·W, 64)다", () => {
    expect(fitScale({ W: 500, H: 2000, chromeHeight: ONE_LINE, device: D }).side).toBe(24);
    expect(fitScale({ W: 1422, H: 802, chromeHeight: ONE_LINE, device: D }).side).toBeCloseTo(56.88, 5);
    expect(fitScale({ W: 1902, H: 982, chromeHeight: ONE_LINE, device: D }).side).toBe(64);
  });

  /** 세로가 모자라면 폭이 아니라 세로가 배율을 정한다 — 고정 재생 동안 목업이 뷰포트를 넘으면 아래가 잘린다. */
  it.each([ONE_LINE, TWO_LINES, CHROME_GAP + 120])("폭이 넉넉해도 베젤 + 캔버스 + 캡션 블록(chromeHeight %d)이 세로에 들어간다 — 세 그릇", (chromeHeight) => {
    for (const device of DEVICES) {
      for (const { W, H } of [...VIEWPORTS, { W: 2542, H: 600 }, { W: 357, H: 569 }]) {
        const f = fitScale({ W, H, chromeHeight, device });
        expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.chromeY + (chromeHeight - CHROME_GAP)).toBeLessThanOrEqual(H + 1e-9);
        expect(f.x).toBeGreaterThanOrEqual(f.side - 1e-9);
      }
    }
  });

  /** 캡션 자리는 그 상태의 높이다 — 세 상태 최대를 잡던 자리(순환 때문이었다)는 없다. */
  it.each([
    [357, 714, TWO_LINES],
    [750, 926, ONE_LINE],
    [1006, 670, ONE_LINE],
    [1902, 982, TWO_LINES],
  ])("%d×%d — 그릇마다 가로 가운데 · 그 상태 높이와 캡션 블록을 합친 덩어리가 세로 가운데다", (W, H, chromeHeight) => {
    for (const device of DEVICES) {
      const Wk = STATE_CANVAS_W[device];
      const Hk = STATE_CANVAS_H[device];
      const { scale, x, y, chromeY } = fitScale({ W, H, chromeHeight, device });
      expect(x).toBeCloseTo((W - Wk * scale) / 2, 10);
      // 위 여백 = 아래 여백: y = (H − Hk·s − chromeHeight) / 2.
      expect(y).toBeCloseTo((H - Hk * scale - chromeHeight) / 2, 10);
      expect(H - (chromeY + chromeHeight - CHROME_GAP)).toBeCloseTo(y, 10);
      // 캡션 블록은 베젤 아래 간격 16에서 시작한다 — 간격은 chromeHeight에 이미 들어 있다.
      expect(chromeY).toBeCloseTo(y + Hk * scale + CHROME_GAP, 10);
    }
  });

  /** 캡션이 여러 줄이면 세로 예산이 줄어 배율이 작아진다 — 높이가 입력이라는 것의 직접 증거다. */
  it("세로가 배율을 정하는 구간에서 chromeHeight가 커지면 배율이 정확히 그만큼 줄어든다 — 그 상태 높이로", () => {
    const W = 2542;
    const H = 600;
    for (const device of DEVICES) {
      const one = fitScale({ W, H, chromeHeight: ONE_LINE, device });
      const two = fitScale({ W, H, chromeHeight: TWO_LINES, device });
      expect(two.scale).toBeLessThan(one.scale);
      expect(one.scale).toBeCloseTo((H - 2 * 16 - ONE_LINE) / STATE_CANVAS_H[device], 10);
      expect(two.scale).toBeCloseTo((H - 2 * 16 - TWO_LINES) / STATE_CANVAS_H[device], 10);
    }
  });

  it("폭이 배율을 정하는 구간에서는 chromeHeight가 배율을 바꾸지 않는다", () => {
    const a = fitScale({ W: 357, H: 2000, chromeHeight: ONE_LINE, device: M });
    const b = fitScale({ W: 357, H: 2000, chromeHeight: TWO_LINES, device: M });
    expect(a.scale).toBe(b.scale);
    expect(a.scale).toBeCloseTo((357 - 48) / 393, 10);
  });

  it("패널이 여백보다 작으면 배율은 0이다 — 음수 배율이 거울상을 그리지 않는다", () => {
    for (const device of DEVICES) expect(fitScale({ W: 40, H: 40, chromeHeight: ONE_LINE, device }).scale).toBe(0);
  });

  it("높이가 캡션 블록도 못 담으면 배율은 0이다", () => {
    for (const device of DEVICES) expect(fitScale({ W: 1422, H: 60, chromeHeight: TWO_LINES, device }).scale).toBe(0);
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
    for (const device of DEVICES) {
      const f = fitScale({ ...input, device });
      for (const value of [f.scale, f.x, f.y, f.chromeY, f.side, f.chromeW]) expect(Number.isFinite(value)).toBe(true);
      expect(f.scale).toBeGreaterThanOrEqual(0);
      expect(f.scale).toBeLessThanOrEqual(1);
    }
  });

  it("같은 입력은 늘 같은 값이다", () => {
    const input = { W: 357, H: 569, chromeHeight: TWO_LINES, device: M } as const;
    expect(fitScale(input)).toEqual(fitScale({ ...input }));
  });

  /**
   * **캡션 최대 폭은 그릇 폭에 묶인다** — `min(byWidthOf(Wk), 1)·Wk`(폭만으로 정한 배율의 그릇 폭). 세로 배율로 줄이지 않는다(캡션 높이와 순환하지 않게).
   * D 1440 기준이던 때는 T·M에서 캡션이 프레임보다 넓었다(1023×768 T: 925).
   */
  describe("캡션 폭 — 폭만으로 정한 그릇 폭이 상한이다", () => {
    it.each(DEVICES)("device %d — 폭이 정한다 · 높이로 배율이 줄어도 캡션 상한은 같다", (device) => {
      const Wk = STATE_CANVAS_W[device];
      const tall = fitScale({ W: 357, H: 2000, chromeHeight: TWO_LINES, device });
      const short = fitScale({ W: 357, H: 300, chromeHeight: TWO_LINES, device });
      expect(tall.chromeW).toBeCloseTo(Math.min((357 - 48) / Wk, 1) * Wk, 10);
      expect(short.chromeW).toBe(tall.chromeW);
    });

    it.each(DEVICES)("device %d — 그릇 폭을 넘지 않는다", (device) => {
      expect(fitScale({ W: 4000, H: 3000, chromeHeight: ONE_LINE, device }).chromeW).toBe(STATE_CANVAS_W[device]);
    });

    it("1023×768 T — 캡션 상한은 T 그릇 폭(786)이고 D 기준(925)이 아니다", () => {
      const t = fitScale({ W: 1005, H: 670, chromeHeight: ONE_LINE, device: TAB });
      expect(t.chromeW).toBe(786);
      expect(t.chromeW).toBeLessThan(1005 - 2 * t.side);
    });
  });

  /** 높이 부족 — 고정 재생 대신 같은 5씬을 정적으로 보인다. 판정은 그 상태 높이로 잰 세로 배율만 본다. */
  describe("pinnable — 고정 재생이 가능한가", () => {
    it.each(VIEWPORTS)("$name(D)은 고정 재생이다", ({ W, H }) => {
      expect(fitScale({ W, H, chromeHeight: ONE_LINE, device: D }).pinnable).toBe(true);
    });

    it("375×812(M · 캡션 두 줄)도 고정 재생이다 — 좁은 폭만으로는 정적이 되지 않는다", () => {
      expect(fitScale({ W: 359, H: 716, chromeHeight: TWO_LINES, device: M }).pinnable).toBe(true);
    });

    it("세로가 정한 배율이 하한 아래면 정적이다 — 높이가 같아도 chromeHeight가 커지면 넘어간다", () => {
      const W = 2542;
      const H = 32 + ONE_LINE + 900 * MIN_PINNED_SCALE + 32;
      expect(fitScale({ W, H, chromeHeight: ONE_LINE, device: D }).pinnable).toBe(true);
      expect(fitScale({ W, H, chromeHeight: CHROME_GAP + 100, device: D }).pinnable).toBe(false);
    });

    /** 568×320 가로 폰(M) — 하한 근처에서도 판정이 그릇에 따라 뒤집히지 않는다(세 그릇 모두 정적). */
    it("568×320은 세 그릇 모두 정적이다 — 하한 근처에서 device와 독립", () => {
      for (const chromeHeight of [ONE_LINE, TWO_LINES]) {
        const got = DEVICES.map((device) => fitScale({ W: 550, H: 222, chromeHeight, device }).pinnable);
        expect(got).toEqual([false, false, false]);
      }
    });

    it("0·비정상 치수는 정적이다 — 그릴 것이 없다", () => {
      for (const device of DEVICES) {
        expect(fitScale({ W: 1200, H: 0, chromeHeight: ONE_LINE, device }).pinnable).toBe(false);
        expect(fitScale({ W: 1200, H: Number.NaN, chromeHeight: ONE_LINE, device }).pinnable).toBe(false);
      }
    });
  });
});

/** DESIGN §6.615 "배율 표" — 뷰포트가 고른 그릇의 배율(스크롤러 = 뷰포트 − 16 × − 96). */
describe("fitScale — 배율 표", () => {
  it.each([
    ["1024×768 D(폭)", 1008, 672, ONE_LINE, D, 0.644],
    ["1280×800 D", 1264, 704, ONE_LINE, D, 0.698],
    ["1440×900 D", 1424, 804, ONE_LINE, D, 0.809],
    ["1920×1080 D", 1904, 984, ONE_LINE, D, 1],
    ["2560×1440 D", 2544, 1344, ONE_LINE, D, 1],
    ["768×1024 T(폭)", 752, 928, ONE_LINE, TAB, 0.88],
    ["1023×768 T(세로)", 1007, 672, ONE_LINE, TAB, 0.662],
    ["375×812 M(폭)", 359, 716, TWO_LINES, M, 0.791],
    ["390×844 M(폭)", 374, 748, TWO_LINES, M, 0.83],
  ] as const)("%s → %d", (_, W, H, chromeHeight, device, scale) => {
    expect(Number(fitScale({ W, H, chromeHeight, device }).scale.toFixed(3))).toBe(scale);
  });

  /** M 776의 근거 — 375×812·390×844에서 폭이 배율을 정한다(세로 배율이 폭 배율보다 크다). */
  it.each([
    [359, 716],
    [374, 748],
  ])("%d×%d M — 세로 배율이 폭 배율 이상이다", (W, H) => {
    const side = 24;
    const v = 16;
    expect((H - 2 * v - TWO_LINES) / 776).toBeGreaterThanOrEqual((W - 2 * side) / 393);
  });
});

describe("재생 구간 — 스테이지가 뷰포트를 가진 동안만 씬이 움직인다", () => {
  it("고정 구간은 lead + 씬 다섯 × perScene(H 단위)이고, 트랙은 거기에 H 하나를 더한다", () => {
    expect(pinnedSpan()).toBe(PLAY.lead + 5 * PLAY.perScene);
    expect(trackHeight(800)).toBe(800 * (1 + pinnedSpan()));
  });

  it("기본값은 lead 0 · 씬당 1H다 — 고정 구간 5H · 트랙 6H", () => {
    expect(PLAY).toEqual({ lead: 0, perScene: 1 });
    expect(pinnedSpan()).toBe(5);
    expect(trackHeight(800)).toBe(800 * 6);
  });
});

describe("sceneAt — 씬 번호와 진행도", () => {
  const T = 100;
  const H = 1000;

  it("고정 시작은 씬 ①의 정지 구간 맨 앞이다", () => {
    expect(sceneAt(T, T, H)).toEqual({ i: 0, f: 0, t: 0, h: 0 });
  });

  it("고정 전(목업이 올라오는 중)에도 씬 ①이다", () => {
    expect(sceneAt(0, T, H)).toEqual({ i: 0, f: 0, t: 0, h: 0 });
  });

  /** 정지 0.6 / 전환 0.4. */
  it("정지·전환 경계 — f 0.6 직전은 정지(t 0), 직후는 전환(t > 0)", () => {
    const before = sceneAt(T + 599.9, T, H);
    expect(before.t).toBe(0);
    expect(before.h).toBeCloseTo(0.99983, 4);
    expect(sceneAt(T + 600.1, T, H).t).toBeGreaterThan(0);
    const after = sceneAt(T + 700, T, H);
    expect(after.t).toBeCloseTo(0.25, 10);
    expect(after.h).toBe(1);
  });

  it("씬 안 진행도 h = min(f / 0.6, 1)이다", () => {
    expect(sceneAt(T + 300, T, H).h).toBeCloseTo(0.5, 10);
    expect(sceneAt(T + 600, T, H).h).toBe(1);
    expect(sceneAt(T + 900, T, H).h).toBe(1);
  });

  it("씬 경계 — 직전은 이전 씬의 전환 끝, 직후는 다음 씬의 정지 맨 앞", () => {
    const before = sceneAt(T + 999, T, H);
    expect(before.i).toBe(0);
    expect(before.t).toBeCloseTo(0.9975, 4);
    expect(sceneAt(T + 1000, T, H)).toEqual({ i: 1, f: 0, t: 0, h: 0 });
  });

  it("마지막 씬은 전환하지 않는다", () => {
    const last = sceneAt(T + 4500, T, H);
    expect(last.i).toBe(4);
    expect(last.t).toBe(0);
  });

  /** 고정이 풀리는 순간(u = 5)에 씬 ⑤가 끝나 있어야 CTA가 올라올 때 재생이 멈춰 있다. */
  it("고정 구간 끝과 그 너머는 씬 ⑤의 끝에 머문다 — 인덱스가 5로 넘치지 않는다", () => {
    expect(sceneAt(T + pinnedSpan() * H, T, H)).toEqual({ i: 4, f: 1, t: 0, h: 1 });
    expect(sceneAt(T + 99999, T, H)).toEqual({ i: 4, f: 1, t: 0, h: 1 });
  });

  it("스크롤러 높이가 0이거나 입력이 NaN이면 씬 ①의 맨 앞이다", () => {
    expect(sceneAt(T + 500, T, 0)).toEqual({ i: 0, f: 0, t: 0, h: 0 });
    expect(sceneAt(Number.NaN, T, H)).toEqual({ i: 0, f: 0, t: 0, h: 0 });
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
  const at = (scrollTop: number, reducedMotion = false, height = chromeHeight, device: Device = D, size = { W, H }) =>
    frame({ scrollTop, stageTop, W: size.W, H: size.H, chromeHeight: height, reducedMotion, device });
  const pinned = (q: number, h = H) => stageTop + q * h;
  /** 375 페이지 — M 그릇이 서는 크기다. */
  const NARROW = { W: 359, H: 716 };

  /** 스크롤 구동 확대가 없다 — 올라오는 중에도, 고정 중에도, 끝에서도 같은 배율·같은 위치다(세 그릇 각각). */
  it("배율·위치·그릇 폭이 스크롤 위치와 무관하다", () => {
    for (const device of DEVICES) {
      const fit = fitScale({ W, H, chromeHeight, device });
      for (const top of [0, stageTop / 2, stageTop, pinned(0.8), pinned(2.5), pinned(4.9), pinned(99)]) {
        const f = at(top, false, chromeHeight, device);
        expect([f.scale, f.x, f.y, f.chromeY, f.chromeW, f.pinnable]).toEqual([fit.scale, fit.x, fit.y, fit.chromeY, fit.chromeW, fit.pinnable]);
        expect([f.canvasW, f.canvasH]).toEqual([STATE_CANVAS_W[device], STATE_CANVAS_H[device]]);
      }
    }
  });

  /** V-02 — 고정 재생 내내 그릇 폭·높이가 바뀌지 않는다(0.0005 간격으로 훑는다). */
  it("씬 안 폭·높이 불변 — 세 그릇 × 고정 구간 전부", () => {
    for (const device of DEVICES) {
      for (const reduced of [false, true]) {
        const sizes = new Set<string>();
        for (let q = 0; q <= 5; q += 0.0005) {
          const got = at(pinned(q, NARROW.H), reduced, TWO_LINES, device, NARROW);
          sizes.add(`${got.canvasW}×${got.canvasH}`);
        }
        expect([...sizes]).toEqual([`${STATE_CANVAS_W[device]}×${STATE_CANVAS_H[device]}`]);
      }
    }
  });

  /** 캡션 높이는 배치만 바꾼다 — 씬·진행·캡션 번호는 스크롤 위치의 함수로 남는다. */
  it("chromeHeight는 배치만 바꾸고 씬·캡션·진행·그릇은 바꾸지 않는다", () => {
    for (const device of DEVICES) {
      for (const top of [0, pinned(0.85), pinned(1.3), pinned(2.4), pinned(99)]) {
        const { scale, x, y, chromeY, chromeW, ...rest } = at(top, false, ONE_LINE, device);
        const { scale: s2, x: x2, y: y2, chromeY: c2, chromeW: w2, ...rest2 } = at(top, false, CHROME_GAP + 140, device);
        expect(rest).toEqual(rest2);
        expect(chromeW).toBe(w2);
        expect([scale, x, y, chromeY]).not.toEqual([s2, x2, y2, c2]);
      }
    }
  });

  it("frame의 배치는 그 그릇의 fitScale과 같다 — 식이 두 벌이 아니다", () => {
    for (const device of DEVICES) {
      const f = at(pinned(1.3), false, ONE_LINE, device);
      const fit = fitScale({ W, H, chromeHeight: ONE_LINE, device });
      expect({ scale: f.scale, x: f.x, y: f.y, chromeY: f.chromeY, chromeW: f.chromeW, pinnable: f.pinnable }).toEqual({
        scale: fit.scale,
        x: fit.x,
        y: fit.y,
        chromeY: fit.chromeY,
        chromeW: fit.chromeW,
        pinnable: fit.pinnable,
      });
    }
  });

  it("비정상 치수에서도 프레임 값이 유한하다", () => {
    for (const device of DEVICES) {
      for (const scrollTop of [0, 500, Number.NaN]) {
        const f = frame({ scrollTop, stageTop: 0, W: 0, H: 0, chromeHeight: Number.NaN, reducedMotion: false, device });
        for (const value of [f.scale, f.x, f.y, f.chromeY, f.chromeW, f.canvasW, f.canvasH]) expect(Number.isFinite(value)).toBe(true);
        expect(f.layers).toEqual([1, 0, 0, 0, 0]);
        expect(f.canvasW).toBe(STATE_CANVAS_W[device]);
      }
    }
  });

  /** V-05a — 같은 (scrollTop, stageTop, W, H, chromeHeight, reduced, device) → 같은 프레임. */
  it("같은 입력은 같은 프레임이다 — 내려갔다 돌아와도 같다", () => {
    for (const device of DEVICES) {
      const first = at(pinned(1.3), false, chromeHeight, device);
      at(pinned(3.9), false, chromeHeight, device);
      at(0, true, chromeHeight, (device + 1) % 3 as Device);
      expect(at(pinned(1.3), false, chromeHeight, device)).toEqual(first);
    }
  });

  /** V-05b — 역방향 스크럽: 올렸다 내리면 모든 프레임 값이 같다(이전 프레임·방향을 입력으로 받지 않는다). */
  it("정방향과 역방향이 같은 위치에서 같은 프레임이다", () => {
    const qs = [0, 0.3, 0.7, 0.85, 1.3, 2.4, 3.9, 4.99, 6];
    for (const device of DEVICES) {
      for (const reduced of [false, true]) {
        const forward = qs.map((q) => at(pinned(q), reduced, chromeHeight, device));
        const backward = [...qs].reverse().map((q) => at(pinned(q), reduced, chromeHeight, device)).reverse();
        expect(backward).toEqual(forward);
      }
    }
  });

  it("시작 — 씬 ① · 첫 캡션", () => {
    const f = at(0);
    expect(f.layers).toEqual([1, 0, 0, 0, 0]);
    expect(f.caption).toEqual({ index: 0, opacity: 1 });
  });

  it("전환 한가운데 — 두 씬이 반씩 · 캡션은 0에서 다음 문장으로 바뀐다", () => {
    for (const device of DEVICES) {
      const f = at(pinned(0.8), false, chromeHeight, device);
      expect(f.scene.i).toBe(0);
      [0.5, 0.5, 0, 0, 0].forEach((v, k) => expect(f.layers[k]).toBeCloseTo(v, 10));
      [1, 0.5, 0, 0, 0].forEach((v, k) => expect(f.segments[k]).toBeCloseTo(v, 10));
      expect(f.caption.opacity).toBeCloseTo(0, 10);
    }
  });

  it("전환 뒤 절반은 다음 문장, 앞 절반은 이전 문장이다", () => {
    expect(at(pinned(0.85)).caption.index).toBe(1);
    expect(at(pinned(0.7)).caption.index).toBe(0);
  });

  it("정지 구간 동안 씬은 그대로다 — 레이어·캡션이 움직이지 않는다", () => {
    for (const f of [1.05, 1.3, 1.59]) {
      const got = at(pinned(f), false, chromeHeight, M);
      expect(got.layers).toEqual([0, 1, 0, 0, 0]);
      expect(got.caption).toEqual({ index: 1, opacity: 1 });
      expect(got.segments).toEqual([1, 1, 0, 0, 0]);
    }
  });

  it("끝 — 씬 ⑤ · 진행 칸 전부 참", () => {
    const f = at(pinned(99));
    expect(f.layers).toEqual([0, 0, 0, 0, 1]);
    expect(f.segments).toEqual([1, 1, 1, 1, 1]);
    expect(f.caption.index).toBe(4);
  });

  /** V-05d — 같은 그릇 안에서 캡션 자리는 재생 내내 불변이다. */
  it("캡션 자리(chromeY)·폭 상한은 같은 그릇 안에서 스크롤 위치와 무관하다", () => {
    for (const device of DEVICES) {
      const first = at(0, false, TWO_LINES, device, NARROW);
      for (let q = 0; q <= 5.2; q += 0.01) {
        const got = at(pinned(q, NARROW.H), false, TWO_LINES, device, NARROW);
        expect([got.chromeY, got.chromeW]).toEqual([first.chromeY, first.chromeW]);
      }
    }
  });

  /** V-05e · #239 — 모든 씬 · 모든 전환 · 여섯 공개 뷰포트 × 세 그릇에서 프레임이 스크롤러 안, 캡션 블록 위다. */
  describe("프레임은 재생 내내 스크롤러 안에 있다 (#239)", () => {
    /** 스크롤러 = 뷰포트 − 공개 셸 가로 16 · 세로 96. */
    const PAGES = [
      ["375×812", 359, 716],
      ["390×844", 374, 748],
      ["768×1024", 752, 928],
      ["1024×768", 1008, 672],
      ["1280×800", 1264, 704],
      ["1440×900", 1424, 804],
    ] as const;
    it.each(PAGES)("%s", (_, PW, PH) => {
      for (const device of DEVICES) {
        for (const chrome of [ONE_LINE, TWO_LINES]) {
          const top = fitScale({ W: PW, H: PH, chromeHeight: chrome, device }).y;
          for (const reduced of [false, true]) {
            // 위반만 모은다 — 위치마다 expect를 부르면 수십만 번이라 스위트가 느려진다.
            const outside: number[] = [];
            for (let q = 0; q <= 5; q += 0.0005) {
              const got = frame({ scrollTop: q * PLAY.perScene * PH, stageTop: 0, W: PW, H: PH, chromeHeight: chrome, reducedMotion: reduced, device });
              const right = got.x + got.canvasW * got.scale;
              const bottom = got.y + got.canvasH * got.scale;
              const inside = got.x >= 0 && right <= PW + 1e-9 && got.y >= top - 1e-9 && got.y >= 0
                && bottom <= got.chromeY - CHROME_GAP + 1e-9 && got.chromeY + chrome - CHROME_GAP <= PH + 1e-9;
              if (!inside) outside.push(q);
            }
            expect(outside, `device ${device} · chrome ${chrome} · reduced ${reduced}`).toEqual([]);
          }
        }
      }
    });
  });

  describe("씬 안의 진행 — 정지 구간에서 일어난다", () => {
    it("씬 ② 타이핑은 정지 진행도 h를 따르고, 지나간 뒤엔 다 쳐져 있다", () => {
      expect(at(pinned(0.5)).typed).toBe(0);
      expect(at(pinned(1.3)).typed).toBeCloseTo(0.5, 10);
      expect(at(pinned(2.2)).typed).toBe(1);
    });

    /** 배지 문턱 h .5 ↔ f .3. */
    it("씬 ③ 배지는 f .3(h .5)에서 오르고, 지나간 뒤엔 오른 채다", () => {
      expect(at(pinned(2.29)).badge).toBe(0);
      expect(at(pinned(2.31)).badge).toBe(1);
      expect(at(pinned(2.4)).badge).toBe(1);
      expect(at(pinned(3.2)).badge).toBe(1);
    });
  });

  describe("prefers-reduced-motion", () => {
    /** V-05c — 씬 전환 구간 한가운데(f .8)에서 끊는다. */
    it("씬은 전환 한가운데에서 끊어 바뀐다 — 중간 opacity가 없다", () => {
      expect(at(pinned(0.79), true).layers).toEqual([1, 0, 0, 0, 0]);
      expect(at(pinned(0.81), true).layers).toEqual([0, 1, 0, 0, 0]);
      expect(at(pinned(0.81), true).caption).toEqual({ index: 1, opacity: 1 });
    });

    it("중간 opacity 프레임이 0이다 — 레이어는 늘 0 또는 1", () => {
      for (const device of DEVICES) {
        for (let q = 0; q <= 5; q += 0.0125) {
          for (const v of at(pinned(q), true, chromeHeight, device).layers) expect([0, 1]).toContain(v);
        }
      }
    });

    it("모션 감소도 같은 배율·위치다 — 움직이는 것이 원래 없다", () => {
      for (const device of DEVICES) {
        const fit = fitScale({ W, H, chromeHeight, device });
        const f = at(pinned(0.8), true, chromeHeight, device);
        expect([f.scale, f.x, f.y]).toEqual([fit.scale, fit.x, fit.y]);
      }
    });

    it("씬 안의 진행도 즉시다 — 타이핑·배지가 정지 구간 맨 앞에서 끝나 있다", () => {
      expect(at(pinned(1.05), true).typed).toBe(1);
      expect(at(pinned(2.05), true).badge).toBe(1);
    });
  });
});
