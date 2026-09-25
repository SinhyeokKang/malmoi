/**
 * 랜딩 스테이지의 수학 — 스크롤 위치 하나가 목업의 배율·위치·씬·캡션을 전부 정한다.
 * 정본은 Claude Design `Landing.dc.html` 1b·1c·1f·1g이고 규칙은 DESIGN §6.615가 든다.
 *
 * ⚠️ **잎이다** — 스테이지 클라이언트 컴포넌트가 값으로 읽으므로 아무것도 import하지 않는다
 * (`components/__tests__/client-graph.test.ts`가 센다).
 *
 * ⚠️ **같은 위치 → 같은 프레임.** 역방향 스크럽이 성립하는 유일한 조건이다 — 이전 프레임이나
 * 스크롤 방향을 입력으로 받는 순간 올렸다 내린 화면이 달라진다.
 */

/** 목업의 논리 캔버스. 안쪽은 실제 앱 px이라 뷰포트마다 줄바꿈이 달라지지 않는다. */
const CANVAS_W = 1280;
const CANVAS_H = 720;
/** 대기 상태의 배율 — 맞춤의 0.8배로 떠 있는 "물건"이다. */
const IDLE = 0.8;
/** 배율 상한(시안 열린 결정 5 — 2560×1440에서만 걸린다). */
export const CAP = 1.5;
/** 프레임 아래 캡션 줄(간격 16 + 줄 28). 세로 예산에서 먼저 빠져야 캡션이 프레임을 가리지 않는다. */
const CHROME_H = 44;
/** 씬마다 정지 0.6 / 전환 0.4. */
const HOLD = 0.6;
const SCENES = 5;

const clamp = (lo: number, v: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export type Fit = { m: number; fit: number; yPin: number };

/** `W·H`는 스크롤러의 clientWidth/Height다. */
export function fitScale({ W, H, cap }: { W: number; H: number; cap: number }): Fit {
  const m = clamp(24, 0.04 * H, 48);
  // 패널이 여백보다 작으면 음수 배율이 거울상을 그린다 — 0으로 묶는다.
  const fit = Math.max(0, Math.min((W - 2 * m) / CANVAS_W, (H - 2 * m - CHROME_H) / CANVAS_H, cap));
  return { m, fit, yPin: (H - CANVAS_H * fit - CHROME_H) / 2 };
}

/** 대기 → 고정 트윈의 진행도. `stageTop`은 트랙 섹션의 offsetTop이고, p = 1이 곧 sticky 시작이다. */
export function growProgress(scrollTop: number, stageTop: number): number {
  if (!(stageTop > 0)) return 1;
  return clamp(0, scrollTop / stageTop, 1);
}

export type SceneAt = {
  /** 씬 번호 0..4 */
  i: number;
  /** 씬 안의 위치 0..1 */
  f: number;
  /** 다음 씬으로의 전환 진행도(ease 전) */
  t: number;
  /** 정지 구간 안의 진행도 — ② 타이핑·③ 배지는 t = 0인 정지 구간에서 일어난다 */
  h: number;
};

export function sceneAt(scrollTop: number, stageTop: number, H: number): SceneAt {
  const raw = (scrollTop - stageTop) / H;
  if (!(H > 0) || Number.isNaN(raw)) return { i: 0, f: 0, t: 0, h: 0 };
  const q = clamp(0, raw, SCENES);
  // q = 5에서 i가 5로 넘치면 없는 씬을 찾는다 — 씬 ⑤의 끝에 머문다.
  if (q >= SCENES) return { i: SCENES - 1, f: 1, t: 0, h: 1 };
  const i = Math.floor(q);
  const f = q - i;
  // 마지막 씬은 전환할 다음이 없어 1.0H 전부가 정지다.
  const t = i < SCENES - 1 && f > HOLD ? (f - HOLD) / (1 - HOLD) : 0;
  return { i, f, t, h: Math.min(f / HOLD, 1) };
}

/** 앞 n **코드포인트** — UTF-16 단위로 자르면 서로게이트 쌍이 반쪽으로 남아 깨진 글자가 한 프레임 보인다. */
export function typedPrefix(text: string, progress: number): string {
  const chars = Array.from(text);
  return chars.slice(0, Math.floor(chars.length * clamp(0, progress, 1))).join("");
}

type Five = [number, number, number, number, number];

export type Frame = {
  /** 프레임 transform */
  scale: number;
  x: number;
  y: number;
  /** 고정 상태의 y — 마무리 CTA가 음수 margin-top으로 상쇄한다 */
  yPin: number;
  /** 레이어 opacity 0..1 — radius·그림자 값을 트윈하지 않고 레이어를 교차시킨다 */
  bezel: number;
  shadowIdle: number;
  shadowPin: number;
  chrome: number;
  scene: { i: number; t: number; h: number };
  layers: Five;
  segments: Five;
  caption: { index: number; opacity: number };
  /** 씬 ② 타이핑 진행도 0..1 — `typedPrefix`에 넘긴다 */
  typed: number;
  /** 씬 ③에서 저장한 편집이 Publish 배지에 더해졌는가 */
  badge: 0 | 1;
};

export function frame(input: {
  scrollTop: number;
  stageTop: number;
  W: number;
  H: number;
  reducedMotion: boolean;
}): Frame {
  const { scrollTop, stageTop, W, H, reducedMotion: reduced } = input;
  const { fit, yPin } = fitScale({ W, H, cap: CAP });

  const p = growProgress(scrollTop, stageTop);
  const e = reduced ? 1 : ease(p);
  const scale = reduced ? fit : lerp(IDLE * fit, fit, e);

  const { i, t: rawT, h } = sceneAt(scrollTop, stageTop, H);
  // 모션 감소는 전환 한가운데(f = 0.8)에서 끊어 바꾼다 — 스크롤 길이는 그대로다.
  const t = reduced ? (rawT >= 0.5 ? 1 : 0) : rawT;
  const te = ease(t);
  const five = (at: (k: number) => number): Five => [at(0), at(1), at(2), at(3), at(4)];

  return {
    scale,
    x: (W - CANVAS_W * scale) / 2,
    y: reduced ? yPin : lerp(0, yPin, e),
    yPin,
    bezel: 1 - e,
    shadowIdle: 1 - e,
    shadowPin: e,
    chrome: reduced ? 1 : clamp(0, (p - 0.7) / 0.3, 1),
    scene: { i, t, h },
    layers: five((k) => (k === i ? 1 - te : k === i + 1 ? te : 0)),
    segments: five((k) => (k <= i ? 1 : k === i + 1 ? te : 0)),
    // 캡션은 t = 0.5에서 문장을 바꾼다 — |1 − 2t|라 두 문장이 한순간도 겹쳐 보이지 않는다.
    caption: { index: t < 0.5 ? i : i + 1, opacity: reduced ? 1 : Math.abs(1 - 2 * t) },
    typed: i > 1 ? 1 : i === 1 ? (reduced ? 1 : h) : 0,
    badge: i > 2 || (i === 2 && (reduced || h >= 0.5)) ? 1 : 0,
  };
}
