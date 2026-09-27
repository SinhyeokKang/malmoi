import { describe, expect, it } from "vitest";

import { BEZEL, CANVAS_H, CANVAS_W, PLAY, fitScale, frame, pinnedSpan, sceneAt, trackHeight, typedPrefix } from "@/lib/landing/stage";

/**
 * 랜딩 스테이지의 수학 (DESIGN §6.615).
 *
 * **스크롤 위치 하나가 씬을 몬다** — 같은 위치면 언제나 같은 프레임이어야 역방향 스크럽이 성립한다.
 * **배율·위치는 스크롤과 무관하다**(2026-09-27 사용자 — 스크롤 구동 확대를 걷었다). 크기만이 그것을 정한다.
 */

/** 스크롤러 W×H(= 뷰포트 − 공개 셸 가로 18 · 세로 98). */
const VIEWPORTS = [
  { name: "1280×800", W: 1262, H: 702, scale: 0.7506 },
  { name: "1440×900", W: 1422, H: 802, scale: 0.8704 },
  { name: "1920×1080", W: 1902, H: 982, scale: 1 },
  { name: "2560×1440", W: 2542, H: 1342, scale: 1 },
] as const;

describe("캔버스", () => {
  /** 1440 폭 창에서 본 제품이다(2026-09-27 사용자). 세로 810은 1440×900 화면의 브라우저 뷰포트(≈16:9)다. */
  it("논리 캔버스는 1440×810이고 베젤은 12다", () => {
    expect([CANVAS_W, CANVAS_H, BEZEL]).toEqual([1440, 810, 12]);
  });
});

describe("fitScale — 크기만이 배율을 정한다", () => {
  it.each(VIEWPORTS)("$name → $scale", ({ W, H, scale }) => {
    expect(fitScale({ W, H }).scale).toBeCloseTo(scale, 4);
  });

  it("배율은 1을 넘지 않는다 — 캔버스 안은 실제 앱 px다", () => {
    expect(fitScale({ W: 4000, H: 3000 }).scale).toBe(1);
  });

  it("좌우 여백은 clamp(24, 4%·W, 64)다", () => {
    expect(fitScale({ W: 500, H: 2000 }).side).toBe(24);
    expect(fitScale({ W: 1422, H: 802 }).side).toBeCloseTo(56.88, 5);
    expect(fitScale({ W: 1902, H: 982 }).side).toBe(64);
  });

  /** 세로가 모자라면 폭이 아니라 세로가 배율을 정한다 — 고정 재생 동안 목업이 뷰포트를 넘으면 아래가 잘린다. */
  it("폭이 넉넉해도 베젤 + 캔버스 + 캡션 줄이 세로에 들어간다", () => {
    for (const { W, H } of [...VIEWPORTS, { W: 2542, H: 600 }]) {
      const f = fitScale({ W, H });
      const top = f.y - BEZEL * f.scale;
      const bottom = f.chromeY + 28;
      expect(top).toBeGreaterThanOrEqual(0);
      expect(bottom).toBeLessThanOrEqual(H + 1e-9);
      expect(f.x - BEZEL * f.scale).toBeGreaterThanOrEqual(f.side - 1e-9);
    }
  });

  it("가로 가운데 · 베젤과 캡션 줄을 합친 블록이 세로 가운데다", () => {
    const { scale, x, y, chromeY } = fitScale({ W: 1902, H: 982 });
    expect(x).toBeCloseTo((1902 - CANVAS_W * scale) / 2, 10);
    const top = y - BEZEL * scale;
    const bottom = chromeY + 28;
    expect(top).toBeCloseTo(982 - bottom, 10);
    // 캡션 줄은 베젤 아래 16이다.
    expect(chromeY).toBeCloseTo(y + (CANVAS_H + BEZEL) * scale + 16, 10);
  });

  it("패널이 여백보다 작으면 배율은 0이다 — 음수 배율이 거울상을 그리지 않는다", () => {
    expect(fitScale({ W: 40, H: 40 }).scale).toBe(0);
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
  const fit = fitScale({ W, H });
  const at = (scrollTop: number, reducedMotion = false) => frame({ scrollTop, stageTop, W, H, reducedMotion });
  const pinned = (q: number) => stageTop + q * H;

  /** 스크롤 구동 확대가 없다 — 올라오는 중에도, 고정 중에도, 끝에서도 같은 배율·같은 위치다. */
  it("배율·위치가 스크롤 위치와 무관하다", () => {
    for (const top of [0, stageTop / 2, stageTop, pinned(2.5), pinned(99)]) {
      const f = at(top);
      expect([f.scale, f.x, f.y, f.chromeY]).toEqual([fit.scale, fit.x, fit.y, fit.chromeY]);
    }
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
