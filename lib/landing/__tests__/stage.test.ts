import { describe, expect, it } from "vitest";

import { BEZEL, CANVAS_H, CANVAS_W, CHROME_GAP, MIN_PINNED_SCALE, PLAY, fitScale, frame, pinnedSpan, sceneAt, trackHeight, typedPrefix } from "@/lib/landing/stage";

/**
 * 랜딩 스테이지의 수학 (DESIGN §6.615).
 *
 * **스크롤 위치 하나가 씬을 몬다** — 같은 위치면 언제나 같은 프레임이어야 역방향 스크럽이 성립한다.
 * **배율·위치는 스크롤과 무관하다**(2026-09-27 사용자 — 스크롤 구동 확대를 걷었다). 크기만이 그것을 정한다.
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
});

/**
 * #216 — `lg` 이상 회귀 고정. R5 이전 `fitScale`은 캡션 줄을 상수 28(`h-7`)로 두었다(`CHROME_H = 16 + 28`). 블록이 한 줄이면 잰 높이가 다시 28이므로
 * 같은 크기에서 목업 위치가 그때와 바이트로 같아야 한다. 아래 `legacy`는 R5 이전 식 그대로다.
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
    ["1024×768", 1006, 670],
    ["768×1024", 750, 926],
  ])("%s — 배율 · x · y · chromeY가 같다", (_, W, H) => {
    const fit = fitScale({ W, H, chromeHeight: ONE_LINE });
    const old = legacy(W, H);
    expect({ scale: fit.scale, x: fit.x, y: fit.y, chromeY: fit.chromeY }).toEqual(old);
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

describe("재생 구간 — 스테이지가 뷰포트를 가진 동안만 씬이 움직인다", () => {
  it("고정 구간은 lead + 씬 다섯 × perScene(H 단위)이고, 트랙은 거기에 H 하나를 더한다", () => {
    expect(pinnedSpan()).toBe(PLAY.lead + 5 * PLAY.perScene);
    expect(trackHeight(800)).toBe(800 * (1 + pinnedSpan()));
  });

  it("기본값은 lead 0 · 씬당 1H다 — 조정은 이 두 값이다", () => {
    expect(PLAY).toEqual({ lead: 0, perScene: 1 });
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
  it("정지·전환 경계 — f 0.6 직전은 정지, 직후는 전환", () => {
    const before = sceneAt(T + 599, T, H);
    expect(before.t).toBe(0);
    expect(before.h).toBeCloseTo(0.9983, 3);
    const after = sceneAt(T + 700, T, H);
    expect(after.t).toBeCloseTo(0.25, 10);
    expect(after.h).toBe(1);
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
  const fit = fitScale({ W, H, chromeHeight });
  const at = (scrollTop: number, reducedMotion = false, height = chromeHeight) =>
    frame({ scrollTop, stageTop, W, H, chromeHeight: height, reducedMotion });
  const pinned = (q: number) => stageTop + q * H;

  /** 스크롤 구동 확대가 없다 — 올라오는 중에도, 고정 중에도, 끝에서도 같은 배율·같은 위치다. */
  it("배율·위치가 스크롤 위치와 무관하다", () => {
    for (const top of [0, stageTop / 2, stageTop, pinned(2.5), pinned(99)]) {
      const f = at(top);
      expect([f.scale, f.x, f.y, f.chromeY, f.chromeW]).toEqual([fit.scale, fit.x, fit.y, fit.chromeY, fit.chromeW]);
    }
  });

  /** 캡션 높이는 배치만 바꾼다 — 씬·진행·캡션 번호는 스크롤 위치의 함수로 남는다. */
  it("chromeHeight는 배치만 바꾸고 씬·캡션·진행은 바꾸지 않는다", () => {
    for (const top of [0, pinned(0.85), pinned(1.3), pinned(2.4), pinned(99)]) {
      const { scale, x, y, chromeY, chromeW, ...rest } = at(top, false, ONE_LINE);
      const { scale: s2, x: x2, y: y2, chromeY: c2, chromeW: w2, ...rest2 } = at(top, false, CHROME_GAP + 140);
      expect(rest).toEqual(rest2);
      expect(chromeW).toBe(w2);
      expect([scale, x, y, chromeY]).not.toEqual([s2, x2, y2, c2]);
    }
  });

  it("frame의 배치는 fitScale과 같다 — 식이 두 벌이 아니다", () => {
    const f = at(pinned(1.3), false, ONE_LINE);
    expect({ scale: f.scale, x: f.x, y: f.y, chromeY: f.chromeY, chromeW: f.chromeW, pinnable: f.pinnable }).toEqual({
      scale: fitScale({ W, H, chromeHeight: ONE_LINE }).scale,
      x: fitScale({ W, H, chromeHeight: ONE_LINE }).x,
      y: fitScale({ W, H, chromeHeight: ONE_LINE }).y,
      chromeY: fitScale({ W, H, chromeHeight: ONE_LINE }).chromeY,
      chromeW: fitScale({ W, H, chromeHeight: ONE_LINE }).chromeW,
      pinnable: fitScale({ W, H, chromeHeight: ONE_LINE }).pinnable,
    });
  });

  it("비정상 치수에서도 프레임 값이 유한하다", () => {
    const f = frame({ scrollTop: 0, stageTop: 0, W: 0, H: 0, chromeHeight: Number.NaN, reducedMotion: false });
    for (const value of [f.scale, f.x, f.y, f.chromeY, f.chromeW]) expect(Number.isFinite(value)).toBe(true);
    expect(f.layers).toEqual([1, 0, 0, 0, 0]);
  });

  /** 역방향 스크럽 — 올렸다 내리면 모든 프레임 값이 같다(이전 프레임·방향을 입력으로 받지 않는다). */
  it("정방향과 역방향이 같은 위치에서 같은 프레임이다", () => {
    const qs = [0, 0.3, 0.7, 0.85, 1.3, 2.4, 3.9, 4.99, 6];
    const forward = qs.map((q) => at(pinned(q)));
    const backward = [...qs].reverse().map((q) => at(pinned(q))).reverse();
    expect(backward).toEqual(forward);
  });

  it("모션 감소도 같은 배율·위치다 — 움직이는 것이 원래 없다", () => {
    const f = at(0, true);
    expect([f.scale, f.x, f.y]).toEqual([fit.scale, fit.x, fit.y]);
  });

  it("시작 — 씬 ① · 첫 캡션", () => {
    const f = at(0);
    expect(f.layers).toEqual([1, 0, 0, 0, 0]);
    expect(f.caption).toEqual({ index: 0, opacity: 1 });
  });

  it("전환 한가운데 — 두 씬이 반씩 · 캡션은 0에서 다음 문장으로 바뀐다", () => {
    const f = at(pinned(0.8));
    expect(f.scene.i).toBe(0);
    [0.5, 0.5, 0, 0, 0].forEach((v, k) => expect(f.layers[k]).toBeCloseTo(v, 10));
    [1, 0.5, 0, 0, 0].forEach((v, k) => expect(f.segments[k]).toBeCloseTo(v, 10));
    expect(f.caption.opacity).toBeCloseTo(0, 10);
  });

  it("전환 뒤 절반은 다음 문장, 앞 절반은 이전 문장이다", () => {
    expect(at(pinned(0.85)).caption.index).toBe(1);
    expect(at(pinned(0.7)).caption.index).toBe(0);
  });

  it("끝 — 씬 ⑤ · 진행 칸 전부 참", () => {
    const f = at(pinned(99));
    expect(f.layers).toEqual([0, 0, 0, 0, 1]);
    expect(f.segments).toEqual([1, 1, 1, 1, 1]);
    expect(f.caption.index).toBe(4);
  });

  it("같은 위치는 같은 프레임이다 — 내려갔다 돌아와도 같다", () => {
    const first = at(pinned(1.3));
    at(pinned(3.9));
    at(0);
    expect(at(pinned(1.3))).toEqual(first);
  });

  describe("씬 안의 진행 — 정지 구간에서 일어난다", () => {
    it("씬 ② 타이핑은 정지 진행도 h를 따르고, 지나간 뒤엔 다 쳐져 있다", () => {
      expect(at(pinned(0.5)).typed).toBe(0);
      expect(at(pinned(1.3)).typed).toBeCloseTo(0.5, 10);
      expect(at(pinned(2.2)).typed).toBe(1);
    });

    it("씬 ③ 배지는 정지 구간 한가운데에서 오르고, 지나간 뒤엔 오른 채다", () => {
      expect(at(pinned(2.1)).badge).toBe(0);
      expect(at(pinned(2.4)).badge).toBe(1);
      expect(at(pinned(3.2)).badge).toBe(1);
    });
  });

  describe("prefers-reduced-motion", () => {
    it("씬은 전환 한가운데에서 끊어 바뀐다 — 중간 opacity가 없다", () => {
      expect(at(pinned(0.7), true).layers).toEqual([1, 0, 0, 0, 0]);
      expect(at(pinned(0.9), true).layers).toEqual([0, 1, 0, 0, 0]);
      expect(at(pinned(0.9), true).caption).toEqual({ index: 1, opacity: 1 });
    });

    it("씬 안의 진행도 즉시다 — 타이핑·배지가 정지 구간 맨 앞에서 끝나 있다", () => {
      expect(at(pinned(1.05), true).typed).toBe(1);
      expect(at(pinned(2.05), true).badge).toBe(1);
    });
  });
});
