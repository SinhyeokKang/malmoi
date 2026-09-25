import { describe, expect, it } from "vitest";

import { CAP, fitScale, frame, growProgress, sceneAt, typedPrefix } from "@/lib/landing/stage";

/**
 * 랜딩 스테이지의 수학 (DESIGN §6.615 — 시안 `Landing.dc.html` 1b·1c·1f·1g가 정본).
 *
 * **스크롤 위치 하나가 전부를 몬다** — 같은 위치면 언제나 같은 프레임이어야 역방향 스크럽이 성립한다.
 * 그래서 재생 상태는 전부 여기 순수 함수에 있고, 스테이지 컴포넌트는 결과를 DOM에 옮겨 적기만 한다.
 */

/** 시안 1f 수치표의 스크롤러 W×H(= 패널 − 선 2). */
const VIEWPORTS = [
  { name: "1280×800", W: 1262, H: 702, fit: 0.836 },
  { name: "1440×900", W: 1422, H: 802, fit: 0.964 },
  { name: "1920×1080", W: 1902, H: 982, fit: 1.194 },
  { name: "2560×1440", W: 2542, H: 1342, fit: 1.5 },
] as const;

describe("fitScale — 맞춤 배율", () => {
  it.each(VIEWPORTS)("$name에서 시안 수치표와 같다", ({ W, H, fit }) => {
    expect(fitScale({ W, H, cap: CAP }).fit).toBeCloseTo(fit, 3);
  });

  it("상한은 2560×1440에서만 걸린다 — 맞춤 1.669를 1.5로 자른다", () => {
    expect(fitScale({ W: 2542, H: 1342, cap: 99 }).fit).toBeCloseTo(1.669, 3);
    expect(fitScale({ W: 2542, H: 1342, cap: CAP }).fit).toBe(1.5);
  });

  it("상한은 확정값 1.5다(시안 열린 결정 5)", () => {
    expect(CAP).toBe(1.5);
  });

  /** `m = clamp(24, 0.04·H, 48)` — 양끝이 실제로 걸리는지. */
  it("여백 m은 24와 48 사이로 묶인다", () => {
    expect(fitScale({ W: 1262, H: 702, cap: CAP }).m).toBeCloseTo(28.08, 2);
    expect(fitScale({ W: 1262, H: 400, cap: CAP }).m).toBe(24);
    expect(fitScale({ W: 2542, H: 1342, cap: CAP }).m).toBe(48);
  });

  /** 프레임 + 캡션 줄(44)을 세로 가운데에 둔다 — 상한에 걸린 2560에서 y 109(시안 1f). */
  it("yPin은 프레임과 캡션 줄 블록을 세로 가운데에 둔다", () => {
    expect(fitScale({ W: 2542, H: 1342, cap: CAP }).yPin).toBeCloseTo(109, 5);
    const { m, yPin } = fitScale({ W: 1422, H: 802, cap: CAP });
    expect(yPin).toBeCloseTo(m, 5);
  });

  it("패널이 여백보다 작으면 배율은 0이다 — 음수 배율이 거울상을 그리지 않는다", () => {
    expect(fitScale({ W: 40, H: 40, cap: CAP }).fit).toBe(0);
  });
});

describe("growProgress — 대기 → 고정 트윈의 진행도", () => {
  it("스크롤 0이 대기, stageTop이 고정 시작이다", () => {
    expect(growProgress(0, 420)).toBe(0);
    expect(growProgress(210, 420)).toBe(0.5);
    expect(growProgress(420, 420)).toBe(1);
  });

  it("범위 밖은 0..1로 묶인다", () => {
    expect(growProgress(-50, 420)).toBe(0);
    expect(growProgress(9999, 420)).toBe(1);
  });

  it("stageTop이 0 이하면 이미 고정이다 — 0으로 나누지 않는다", () => {
    expect(growProgress(0, 0)).toBe(1);
    expect(growProgress(0, -10)).toBe(1);
  });
});

describe("sceneAt — 씬 번호와 진행도", () => {
  const T = 100;
  const H = 1000;

  it("고정 시작은 씬 ①의 정지 구간 맨 앞이다", () => {
    expect(sceneAt(T, T, H)).toEqual({ i: 0, f: 0, t: 0, h: 0 });
  });

  it("고정 전(커지는 중)에도 씬 ①이다", () => {
    expect(sceneAt(0, T, H)).toEqual({ i: 0, f: 0, t: 0, h: 0 });
  });

  /** 정지 0.6 / 전환 0.4 (시안 1g). */
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

  /** 전환이 넷뿐이라 마지막 씬은 1.0H 정지다(시안 1g). */
  it("마지막 씬은 전환하지 않는다", () => {
    const last = sceneAt(T + 4500, T, H);
    expect(last.i).toBe(4);
    expect(last.t).toBe(0);
  });

  /** q = 5에서 i가 5가 되면 layers[5]를 찾다 빈 화면이 된다. */
  it("q = 5와 그 너머는 씬 ⑤의 끝에 머문다 — 인덱스가 5로 넘치지 않는다", () => {
    expect(sceneAt(T + 5000, T, H)).toEqual({ i: 4, f: 1, t: 0, h: 1 });
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

  /** UTF-16 단위로 자르면 서로게이트 쌍이 반쪽으로 남아 깨진 글자가 한 프레임 보인다. */
  it("코드포인트 단위로 자른다 — 서로게이트 쌍을 반쪽으로 남기지 않는다", () => {
    expect(typedPrefix("a😀b", 2 / 3)).toBe("a😀");
  });
});

describe("frame — 한 스크롤 위치에 한 프레임", () => {
  const W = 1422;
  const H = 802;
  const stageTop = 420;
  const { fit, yPin } = fitScale({ W, H, cap: CAP });
  const at = (scrollTop: number, reducedMotion = false) => frame({ scrollTop, stageTop, W, H, reducedMotion });
  /** 고정 뒤 q에 해당하는 scrollTop. */
  const pinned = (q: number) => stageTop + q * H;

  it("대기 — 맞춤의 0.8배 · 베젤과 대기 그림자 · 크롬 숨김 · 가운데 정렬", () => {
    const f = at(0);
    expect(f.scale).toBeCloseTo(0.8 * fit, 10);
    expect(f.y).toBe(0);
    expect(f.x).toBeCloseTo((W - 1280 * f.scale) / 2, 10);
    expect(f.bezel).toBe(1);
    expect(f.shadowIdle).toBe(1);
    expect(f.shadowPin).toBe(0);
    expect(f.chrome).toBe(0);
    expect(f.layers).toEqual([1, 0, 0, 0, 0]);
    expect(f.caption).toEqual({ index: 0, opacity: 1 });
  });

  it("커지는 중간 — easeInOut 한가운데는 배율도 한가운데다 · 크롬은 p 0.7부터", () => {
    const f = at(stageTop / 2);
    expect(f.scale).toBeCloseTo(0.9 * fit, 10);
    expect(f.bezel).toBeCloseTo(0.5, 10);
    expect(f.chrome).toBe(0);
  });

  it("고정 — 맞춤 배율 · yPin · 베젤 0 · 고정 그림자 · 크롬 보임", () => {
    const f = at(stageTop);
    expect(f.scale).toBeCloseTo(fit, 10);
    expect(f.y).toBeCloseTo(yPin, 10);
    expect(f.yPin).toBeCloseTo(yPin, 10);
    expect(f.bezel).toBe(0);
    expect(f.shadowPin).toBe(1);
    expect(f.chrome).toBe(1);
  });

  /** 캡션 opacity = |1 − 2t| — 두 문장이 한순간도 겹쳐 보이지 않는다(시안 1g). */
  it("전환 한가운데 — 두 씬이 반씩 · 캡션은 0에서 다음 문장으로 바뀐다", () => {
    const f = at(pinned(0.8));
    expect(f.scene.i).toBe(0);
    // 부동소수 — 0.8·H가 정확히 떨어지지 않아 t가 0.5에서 1e-16쯤 벗어난다.
    [0.5, 0.5, 0, 0, 0].forEach((v, k) => expect(f.layers[k]).toBeCloseTo(v, 10));
    [1, 0.5, 0, 0, 0].forEach((v, k) => expect(f.segments[k]).toBeCloseTo(v, 10));
    expect(f.caption.opacity).toBeCloseTo(0, 10);
  });

  it("전환 뒤 절반은 다음 문장이다", () => {
    const f = at(pinned(0.85));
    expect(f.caption.index).toBe(1);
    expect(f.caption.opacity).toBeGreaterThan(0);
  });

  it("전환 앞 절반은 이전 문장이다", () => {
    const f = at(pinned(0.7));
    expect(f.caption.index).toBe(0);
    expect(f.caption.opacity).toBeGreaterThan(0);
  });

  it("끝 — 씬 ⑤ · 진행 칸 전부 참", () => {
    const f = at(pinned(99));
    expect(f.layers).toEqual([0, 0, 0, 0, 1]);
    expect(f.segments).toEqual([1, 1, 1, 1, 1]);
    expect(f.caption.index).toBe(4);
  });

  /** 역방향 스크럽 — 경로와 무관하게 위치만이 프레임을 정한다. */
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
      expect(at(pinned(1.9)).badge).toBe(0);
      expect(at(pinned(2.1)).badge).toBe(0);
      expect(at(pinned(2.4)).badge).toBe(1);
      expect(at(pinned(3.2)).badge).toBe(1);
    });
  });

  describe("prefers-reduced-motion", () => {
    it("대기에서도 맞춤 배율 · yPin · 베젤 0 · 크롬 보임 — 트윈이 없다", () => {
      const f = at(0, true);
      expect(f.scale).toBeCloseTo(fit, 10);
      expect(f.y).toBeCloseTo(yPin, 10);
      expect(f.bezel).toBe(0);
      expect(f.shadowPin).toBe(1);
      expect(f.chrome).toBe(1);
    });

    /** 전환 구간 한가운데(f = 0.8, t = 0.5)에서 단절 전환(시안 1g). */
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
