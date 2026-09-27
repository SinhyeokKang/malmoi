/**
 * 랜딩 스테이지의 수학 — **크기가 목업의 배율·위치를 정하고, 스크롤 위치가 씬·캡션을 정한다.** 규칙은 DESIGN §6.615가 든다.
 *
 * ⚠️ **잎이다** — 스테이지 클라이언트 컴포넌트가 값으로 읽으므로 아무것도 import하지 않는다
 * (`components/__tests__/client-graph.test.ts`가 센다).
 *
 * ⚠️ **같은 위치 → 같은 프레임.** 역방향 스크럽이 성립하는 유일한 조건이다 — 이전 프레임이나
 * 스크롤 방향을 입력으로 받는 순간 올렸다 내린 화면이 달라진다.
 *
 * ⚠️ **스크롤 구동 확대가 없다** (2026-09-27 사용자 — 대기 0.8배 → 맞춤 트윈을 걷었다). 배율은 폭·높이의 함수이고
 * 스크롤로 움직이는 것은 씬 교차·캡션·진행 칸·타이핑·배지뿐이다.
 */

/**
 * 목업의 논리 캔버스 — **1440 폭 창에서 본 제품이다**(2026-09-27 사용자). 안은 실제 앱 px라 뷰포트마다 줄바꿈이 달라지지 않는다.
 * 세로 810은 1440×900 화면에서 브라우저 크롬을 뺀 뷰포트(≈16:9)이고, 1440×900 뷰포트의 스테이지(H 802)에 캡션 줄과 함께 들어간다.
 */
export const CANVAS_W = 1440;
export const CANVAS_H = 810;
/** 흰 베젤 두께(`-inset-3`) — 프레임과 함께 배율을 받으므로 맞춤 예산에서 빠진다. */
export const BEZEL = 12;
/** 베젤 아래 캡션 줄(간격 16 + 줄 28). 세로 예산에서 먼저 빠져야 캡션이 뷰포트 밖으로 안 나간다. */
const CHROME_GAP = 16;
const CHROME_H = CHROME_GAP + 28;
/** 씬마다 정지 0.6 / 전환 0.4. */
const HOLD = 0.6;
const SCENES = 5;

/**
 * **재생 타이밍 — 눈으로 맞출 때 이 두 값만 고친다** (H = 스테이지 높이 단위).
 * - `lead`: 고정이 시작된 뒤 씬 ①이 정지 구간을 시작하기까지의 여유. 0이면 목업이 가운데에 서는 순간 시작한다.
 * - `perScene`: 씬 하나에 드는 스크롤 길이.
 * 트랙 높이가 두 값을 따라가므로(`trackHeight`) 고정 구간과 재생 구간이 어긋나지 않는다.
 */
export const PLAY = { lead: 0, perScene: 1 } as const;

const clamp = (lo: number, v: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export type Fit = {
  scale: number;
  /** 캔버스(베젤 안쪽) 왼쪽 위의 스크롤러 좌표 */
  x: number;
  y: number;
  /** 캡션 줄 윗변 */
  chromeY: number;
  /** 좌우 여백 */
  side: number;
};

/**
 * `W·H`는 스크롤러의 clientWidth/Height다. 배율은 **폭이 정하고 1을 넘지 않는다** — 1440 창에서 ≈0.9(공개 셸·여백만큼 작다).
 * 세로가 모자라면 세로가 정한다: 고정 재생 동안 스테이지가 뷰포트를 가지므로 넘치면 목업 아래가 잘린다.
 */
export function fitScale({ W, H }: { W: number; H: number }): Fit {
  const side = clamp(24, 0.04 * W, 64);
  const v = clamp(16, 0.02 * H, 32);
  // 패널이 여백보다 작으면 음수 배율이 거울상을 그린다 — 0으로 묶는다.
  const scale = Math.max(0, Math.min((W - 2 * side) / (CANVAS_W + 2 * BEZEL), (H - 2 * v - CHROME_H) / (CANVAS_H + 2 * BEZEL), 1));
  const top = (H - (CANVAS_H + 2 * BEZEL) * scale - CHROME_H) / 2;
  const y = top + BEZEL * scale;
  return { scale, x: (W - CANVAS_W * scale) / 2, y, chromeY: y + (CANVAS_H + BEZEL) * scale + CHROME_GAP, side };
}

/** 고정 구간 길이(H 단위). 씬 ⑤의 정지는 이 구간 끝까지다 — 고정이 풀릴 때 재생이 끝나 있다. */
export function pinnedSpan(): number {
  return PLAY.lead + SCENES * PLAY.perScene;
}

/** 트랙 높이 — sticky 한 장(H) + 고정 구간. */
export function trackHeight(H: number): number {
  return H * (1 + pinnedSpan());
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

/** `stageTop`은 트랙 윗변의 스크롤러 좌표 — 그 위치가 곧 sticky 시작이다. */
export function sceneAt(scrollTop: number, stageTop: number, H: number): SceneAt {
  const raw = ((scrollTop - stageTop) / H - PLAY.lead) / PLAY.perScene;
  if (!(H > 0) || Number.isNaN(raw)) return { i: 0, f: 0, t: 0, h: 0 };
  const q = clamp(0, raw, SCENES);
  // q = 5에서 i가 5로 넘치면 없는 씬을 찾는다 — 씬 ⑤의 끝에 머문다.
  if (q >= SCENES) return { i: SCENES - 1, f: 1, t: 0, h: 1 };
  const i = Math.floor(q);
  const f = q - i;
  // 마지막 씬은 전환할 다음이 없어 전부가 정지다.
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
  /** 프레임 transform — 크기만의 함수다 */
  scale: number;
  x: number;
  y: number;
  chromeY: number;
  scene: { i: number; t: number; h: number };
  /** 레이어 opacity 0..1 */
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
  const { scale, x, y, chromeY } = fitScale({ W, H });

  const { i, t: rawT, h } = sceneAt(scrollTop, stageTop, H);
  // 모션 감소는 전환 한가운데(f = 0.8)에서 끊어 바꾼다 — 스크롤 길이는 그대로다.
  const t = reduced ? (rawT >= 0.5 ? 1 : 0) : rawT;
  const te = ease(t);
  const five = (at: (k: number) => number): Five => [at(0), at(1), at(2), at(3), at(4)];

  return {
    scale,
    x,
    y,
    chromeY,
    scene: { i, t, h },
    layers: five((k) => (k === i ? 1 - te : k === i + 1 ? te : 0)),
    segments: five((k) => (k <= i ? 1 : k === i + 1 ? te : 0)),
    // 캡션은 t = 0.5에서 문장을 바꾼다 — |1 − 2t|라 두 문장이 한순간도 겹쳐 보이지 않는다.
    caption: { index: t < 0.5 ? i : i + 1, opacity: reduced ? 1 : Math.abs(1 - 2 * t) },
    typed: i > 1 ? 1 : i === 1 ? (reduced ? 1 : h) : 0,
    badge: i > 2 || (i === 2 && (reduced || h >= 0.5)) ? 1 : 0,
  };
}
