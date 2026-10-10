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
 * 툴바와 베젤을 포함한 바깥 컨테이너가 1440×900(16:10)이다.
 */
export const CANVAS_W = 1440;
export const CANVAS_H = 900;
/** 컨테이너 안쪽의 좌우·아래 베젤 두께. */
export const BEZEL = 8;
/** 컨테이너 상단 macOS 스타일 툴바. */
export const TOOLBAR_H = 44;
/**
 * 베젤과 캡션 블록 사이 간격. ⚠️ **`chromeHeight`가 이 간격을 이미 품는다** — 호출부는 잰 블록 높이에 이 값을 더해 넘긴다.
 * 캡션 높이는 고정 상수가 아니다(좁으면 감겨 여러 줄이고 언어마다 다르다) — 그래서 `fitScale`·`frame`이 **필수 입력**으로 받는다.
 */
export const CHROME_GAP = 16;
/**
 * 세로가 정한 배율의 하한 — 아래면 고정 재생 대신 같은 5씬을 정적 흐름으로 보인다(`Fit.pinnable`).
 * 375 폭의 폭 배율(0.215)보다 살짝 낮게 잡아, 폰 가로(667×375 → 0.223)는 고정으로 남고 훨씬 낮은 창만 정적이 된다.
 */
export const MIN_PINNED_SCALE = 0.2;
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
/** 0·NaN·±Infinity·음수는 0이다 — 치수가 비정상이어도 NaN이 transform 문자열에 실리지 않는다. */
const dim = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export type Fit = {
  scale: number;
  /** 컨테이너 왼쪽 위의 스크롤러 좌표 */
  x: number;
  y: number;
  /** 캡션 블록 윗변 */
  chromeY: number;
  /** 좌우 여백 */
  side: number;
  /** 캡션 블록의 최대 폭 — 프레임 폭(폭만으로 정한 배율의 1440). 세로 배율로 줄이지 않는다(캡션 높이와 순환하지 않게). */
  chromeW: number;
  /** 세로가 정한 배율이 `MIN_PINNED_SCALE` 이상인가 — 아니면 고정 재생 대신 정적 흐름이다. */
  pinnable: boolean;
};

/**
 * `W·H`는 스크롤러의 clientWidth/Height, `chromeHeight`는 **잰** 캡션 블록 높이(베젤과의 간격 16 포함)다.
 * 배율은 **폭이 정하고 1을 넘지 않는다** — 1440 창에서 ≈0.9(공개 셸·여백만큼 작다).
 * 세로가 모자라면 세로가 정한다: 고정 재생 동안 스테이지가 뷰포트를 가지므로 넘치면 목업 아래가 잘린다.
 */
export function fitScale({ W, H, chromeHeight }: { W: number; H: number; chromeHeight: number }): Fit {
  const w = dim(W);
  const h = dim(H);
  const chrome = dim(chromeHeight);
  const side = clamp(24, 0.04 * w, 64);
  const v = clamp(16, 0.02 * h, 32);
  const byWidth = Math.max(0, (w - 2 * side) / CANVAS_W);
  // 패널이 여백·캡션보다 작으면 음수 배율이 거울상을 그린다 — 0으로 묶는다.
  const byHeight = Math.max(0, (h - 2 * v - chrome) / CANVAS_H);
  const scale = Math.min(byWidth, byHeight, 1);
  const y = (h - CANVAS_H * scale - chrome) / 2;
  return {
    scale,
    x: (w - CANVAS_W * scale) / 2,
    y,
    chromeY: y + CANVAS_H * scale + CHROME_GAP,
    side,
    chromeW: Math.min(byWidth, 1) * CANVAS_W,
    pinnable: byHeight >= MIN_PINNED_SCALE,
  };
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
  chromeW: number;
  pinnable: boolean;
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
  /** 잰 캡션 블록 높이(간격 16 포함) — `fitScale`을 보라. */
  chromeHeight: number;
  reducedMotion: boolean;
}): Frame {
  const { scrollTop, stageTop, W, H, chromeHeight, reducedMotion: reduced } = input;
  const { scale, x, y, chromeY, chromeW, pinnable } = fitScale({ W, H, chromeHeight });

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
    chromeW,
    pinnable,
    scene: { i, t, h },
    layers: five((k) => (k === i ? 1 - te : k === i + 1 ? te : 0)),
    segments: five((k) => (k <= i ? 1 : k === i + 1 ? te : 0)),
    // 캡션은 t = 0.5에서 문장을 바꾼다 — |1 − 2t|라 두 문장이 한순간도 겹쳐 보이지 않는다.
    caption: { index: t < 0.5 ? i : i + 1, opacity: reduced ? 1 : Math.abs(1 - 2 * t) },
    typed: i > 1 ? 1 : i === 1 ? (reduced ? 1 : h) : 0,
    badge: i > 2 || (i === 2 && (reduced || h >= 0.5)) ? 1 : 0,
  };
}
