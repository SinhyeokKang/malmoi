/**
 * 랜딩 스테이지의 수학 — **크기가 목업의 배율·위치를 정하고, 스크롤 위치가 씬·캡션을 정한다.** 규칙은 DESIGN §6.615가 든다.
 *
 * ⚠️ **잎이다** — 스테이지 클라이언트 컴포넌트가 값으로 읽으므로 아무것도 import하지 않는다
 * (`components/__tests__/client-graph.test.ts`가 센다).
 *
 * ⚠️ **같은 위치 → 같은 프레임.** 역방향 스크럽이 성립하는 유일한 조건이다 — 이전 프레임이나
 * 스크롤 방향을 입력으로 받는 순간 올렸다 내린 화면이 달라진다.
 *
 * ⚠️ **스크롤 구동 확대가 없다** (2026-09-27 사용자 — 대기 0.8배 → 맞춤 트윈을 걷었다). 상태(D·T·M)마다의 배율은 폭·높이의
 * 함수이고, 스크롤은 **어느 상태인가**(씬마다 데스크톱 → 태블릿 → 모바일 그릇, 2026-10-11 MK1 — design §2)와 씬 교차·캡션·
 * 진행 칸·타이핑·배지를 정한다. 캡션 자리는 세 상태 중 가장 큰 것의 높이라 스크롤로 움직이지 않는다.
 */

/**
 * 목업의 논리 캔버스 — **1440 폭 창에서 본 제품이다**(2026-09-27 사용자). 안은 실제 앱 px라 뷰포트마다 줄바꿈이 달라지지 않는다.
 * 툴바와 베젤을 포함한 바깥 컨테이너가 1440×900(16:10)이다.
 */
export const CANVAS_W = 1440;
export const CANVAS_H = 900;
/**
 * 그릇 상태 D·T·M의 캔버스 폭. **목업 루트(베젤 안 화면의 내용 상자) = 캔버스 − 18**(베젤 8×2 + 화면 border 1×2)이라 루트가 1422 · 768 · 375다
 * (2026-10-11 D7). T·M 768·375는 spec 고정 — responsive-app QA가 실측한 폭이고 앱 경계(640 · 772 · 1024) 바로 옆을 피한다.
 * D는 캔버스 1440을 지킨다(루트 1422는 1424와 같은 갈래라 씬 좌표가 그대로다). 높이는 셋 다 900.
 */
export const STATE_CANVAS_W = [CANVAS_W, 786, 393] as const;
/** 컨테이너 안쪽의 좌우·아래 베젤 두께. */
export const BEZEL = 8;
/** 베젤 안 화면의 테두리 두께 — 스테이지 화면의 `border` 클래스(1px)를 숫자로 옮긴 것이다. 목업 루트 폭이 이만큼 더 좁다. */
export const SCREEN_BORDER = 1;
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
const SCENES = 5;
/**
 * 씬 안 구간(f = 0 → 1, MK1): D 정지 .18 · D→T .10 · T 정지 .18 · T→M .10 · M 정지 .18 · 다음 씬 교차 .13 · M→D 복귀 .13.
 * ⚠️ **교차는 M 폭에서 먼저 끝내고 그다음에 새 씬이 D로 넓어진다** — 내용 교차와 폭 변화가 겹치면 두 움직임이 다툰다.
 * 마지막 씬은 교차할 다음이 없어 `TO_M` 끝(.56)부터 끝까지 M 정지다.
 */
const TO_T = [0.18, 0.28] as const;
const TO_M = [0.46, 0.56] as const;
const CROSS = [0.74, 0.87] as const;
/** 씬 안 진행도 `h`(② 타이핑 · ③ 배지)가 걸치는 구간 — D 정지 시작부터 M 정지 끝. */
const CONTENT_END = CROSS[0];

/**
 * **재생 타이밍 — 눈으로 맞출 때 이 두 값만 고친다** (H = 스테이지 높이 단위).
 * - `lead`: 고정이 시작된 뒤 씬 ①이 정지 구간을 시작하기까지의 여유. 0이면 목업이 가운데에 서는 순간 시작한다.
 * - `perScene`: 씬 하나에 드는 스크롤 길이.
 * 트랙 높이가 두 값을 따라가므로(`trackHeight`) 고정 구간과 재생 구간이 어긋나지 않는다.
 */
export const PLAY = { lead: 0, perScene: 1.5 } as const;

const clamp = (lo: number, v: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** 0·NaN·±Infinity·음수는 0이다 — 치수가 비정상이어도 NaN이 transform 문자열에 실리지 않는다. */
const dim = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** 양 끝(k 0·1)에서 정확히 p·q다 — `p + (q − p)·k`는 k = 1에서 q와 마지막 자리가 어긋나 "중간 폭 0프레임"이 깨진다. */
const lerp = (p: number, q: number, k: number): number => p * (1 - k) + q * k;

export type Fit = {
  scale: number;
  /** 컨테이너 왼쪽 위의 스크롤러 좌표 */
  x: number;
  y: number;
  /** 캡션 블록 윗변 — 세 상태 중 가장 큰 것(M)의 높이로 잡은 자리 아래라 상태와 무관하다. */
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
 * `canvasW`는 그릇 상태의 캔버스 폭(`STATE_CANVAS_W`, 기본 D)이다.
 * 배율은 **폭이 정하고 1을 넘지 않는다** — 1440 창의 D에서 ≈0.9(공개 셸·여백만큼 작다).
 * 세로가 모자라면 세로가 정한다: 고정 재생 동안 스테이지가 뷰포트를 가지므로 넘치면 목업 아래가 잘린다.
 *
 * ⚠️ **세로 자리는 세 상태 중 가장 큰 것의 높이다**(MK1) — 각 상태는 그 자리의 세로 가운데에 서고 캡션은 자리 아래 16에 고정된다.
 * 상태마다 자기 높이로 가운데에 서면 그릇이 바뀔 때 캡션·진행 칸이 위아래로 튄다.
 */
export function fitScale({ W, H, chromeHeight, canvasW = CANVAS_W }: { W: number; H: number; chromeHeight: number; canvasW?: number }): Fit {
  const w = dim(W);
  const h = dim(H);
  const chrome = dim(chromeHeight);
  const side = clamp(24, 0.04 * w, 64);
  const v = clamp(16, 0.02 * h, 32);
  // 패널이 여백·캡션보다 작으면 음수 배율이 거울상을 그린다 — 0으로 묶는다.
  const byHeight = Math.max(0, (h - 2 * v - chrome) / CANVAS_H);
  const byWidthOf = (cw: number) => Math.max(0, (w - 2 * side) / cw);
  const scaleOf = (cw: number) => Math.min(byWidthOf(cw), byHeight, 1);
  const scale = scaleOf(canvasW);
  const slot = CANVAS_H * Math.max(...STATE_CANVAS_W.map(scaleOf));
  const top = (h - slot - chrome) / 2;
  return {
    scale,
    x: (w - canvasW * scale) / 2,
    y: top + (slot - CANVAS_H * scale) / 2,
    chromeY: top + slot + CHROME_GAP,
    side,
    chromeW: Math.min(byWidthOf(CANVAS_W), 1) * CANVAS_W,
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

/** 그릇 상태 — `STATE_CANVAS_W`의 번호(0 D · 1 T · 2 M). */
export type Device = 0 | 1 | 2;

export type SceneAt = {
  /** 씬 번호 0..4 */
  i: number;
  /** 씬 안의 위치 0..1 */
  f: number;
  /** 다음 씬으로의 교차 진행도(ease 전) — 복귀 구간에서는 1이다 */
  t: number;
  /** 씬 안 진행도 — ② 타이핑·③ 배지는 교차 전(f 0 → .74)에 일어난다 */
  h: number;
  /** 그릇 상태 — `from`에서 `to`로 `u`(ease 전)만큼. 정지면 from = to · u = 0이다. */
  device: { from: Device; to: Device; u: number };
};

const hold = (d: Device) => ({ from: d, to: d, u: 0 });
const span = (f: number, [a, b]: readonly [number, number]) => (f - a) / (b - a);

/** 씬 안 위치의 그릇 상태 — 구간표(`TO_T`·`TO_M`·`CROSS`)를 그대로 읽는다. */
function deviceAt(f: number, last: boolean): SceneAt["device"] {
  if (f < TO_T[0]) return hold(0);
  if (f < TO_T[1]) return { from: 0, to: 1, u: span(f, TO_T) };
  if (f < TO_M[0]) return hold(1);
  if (f < TO_M[1]) return { from: 1, to: 2, u: span(f, TO_M) };
  if (last || f < CROSS[1]) return hold(2);
  return { from: 2, to: 0, u: (f - CROSS[1]) / (1 - CROSS[1]) };
}

/** `stageTop`은 트랙 윗변의 스크롤러 좌표 — 그 위치가 곧 sticky 시작이다. */
export function sceneAt(scrollTop: number, stageTop: number, H: number): SceneAt {
  const raw = ((scrollTop - stageTop) / H - PLAY.lead) / PLAY.perScene;
  if (!(H > 0) || Number.isNaN(raw)) return { i: 0, f: 0, t: 0, h: 0, device: hold(0) };
  const q = clamp(0, raw, SCENES);
  // q = 5에서 i가 5로 넘치면 없는 씬을 찾는다 — 씬 ⑤의 끝(M)에 머문다.
  if (q >= SCENES) return { i: SCENES - 1, f: 1, t: 0, h: 1, device: hold(2) };
  const i = Math.floor(q);
  const f = q - i;
  const last = i === SCENES - 1;
  // 마지막 씬은 교차할 다음이 없다.
  const t = last ? 0 : clamp(0, span(f, CROSS), 1);
  return { i, f, t, h: Math.min(f / CONTENT_END, 1), device: deviceAt(f, last) };
}

/** 앞 n **코드포인트** — UTF-16 단위로 자르면 서로게이트 쌍이 반쪽으로 남아 깨진 글자가 한 프레임 보인다. */
export function typedPrefix(text: string, progress: number): string {
  const chars = Array.from(text);
  return chars.slice(0, Math.floor(chars.length * clamp(0, progress, 1))).join("");
}

type Five = [number, number, number, number, number];

export type Frame = {
  /** 프레임 캔버스 폭 — 그릇 상태 사이를 보간한 값이고, 베젤 안 화면(목업 루트)의 레이아웃 폭은 여기서 베젤 8×2를 뺀 값이다 */
  canvasW: number;
  /** 프레임 transform — 그릇 상태의 배율을 폭과 같은 t로 보간한 값 */
  scale: number;
  x: number;
  y: number;
  chromeY: number;
  chromeW: number;
  pinnable: boolean;
  scene: { i: number; t: number; h: number };
  /** 레이어 opacity 0..1 */
  layers: Five;
  /**
   * 배치에 남는 레이어 — 나머지는 레이아웃에서 뺀다(`content-visibility: hidden`). **씬 번호가 아니라 구간이 고른다**: M 정지 전(f < .56)은
   * 현재 하나, M 정지·교차(.56 ≤ f < .87)는 현재·다음 둘, 복귀(f ≥ .87)는 다음 하나, 마지막 씬은 ⑤ 하나.
   * ⚠️ 폭이 움직이는 세 구간은 보이는 레이어 하나만 리플로하고, 다음 레이어는 가장 싼 배치인 M 폭(393)에서 풀린다 — 교차까지 .18의 여유가 있다.
   */
  live: [boolean, boolean, boolean, boolean, boolean];
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
  const fits = STATE_CANVAS_W.map((canvasW) => fitScale({ W, H, chromeHeight, canvasW }));
  // 캡션 자리·폭 상한·pinnable은 상태와 무관하다(`fitScale`) — 어느 상태의 값을 읽어도 같다.
  const { chromeY, chromeW, pinnable } = fits[0] as Fit;

  const { i, f, t: rawT, h, device } = sceneAt(scrollTop, stageTop, H);
  // 모션 감소는 전환 한가운데에서 끊어 바꾼다 — 씬 교차도 그릇 폭도 중간 프레임이 0이고, 스크롤 길이는 그대로다.
  const snap = (v: number) => (reduced ? (v >= 0.5 ? 1 : 0) : v);
  const t = snap(rawT);
  const te = ease(t);
  // ⚠️ 폭과 배율을 **같은 t로** 보간한다(MK1) — 배율을 보간된 폭으로 다시 맞추면 두 값이 따로 놀아 그릇이 출렁인다.
  const ue = ease(snap(device.u));
  const a = fits[device.from] as Fit;
  const b = fits[device.to] as Fit;
  const canvasW = lerp(STATE_CANVAS_W[device.from], STATE_CANVAS_W[device.to], ue);
  const scale = lerp(a.scale, b.scale, ue);
  const five = (at: (k: number) => number): Five => [at(0), at(1), at(2), at(3), at(4)];
  // 마지막 씬은 다음이 없다 — `i + 1` = 5는 어느 레이어와도 같지 않아 ⑤ 하나만 남는다.
  const withCurrent = i === SCENES - 1 || f < CROSS[1];
  const withNext = f >= TO_M[1];

  return {
    canvasW,
    scale,
    // x·y는 보간된 폭·배율에서 나온다 — 가로 가운데, 세로는 자리 안 가운데(y는 배율에 선형이라 두 상태의 y를 보간한 값과 같다).
    x: (dim(W) - canvasW * scale) / 2,
    y: lerp(a.y, b.y, ue),
    chromeY,
    chromeW,
    pinnable,
    scene: { i, t, h },
    layers: five((k) => (k === i ? 1 - te : k === i + 1 ? te : 0)),
    live: [0, 1, 2, 3, 4].map((k) => (k === i && withCurrent) || (k === i + 1 && withNext)) as Frame["live"],
    segments: five((k) => (k <= i ? 1 : k === i + 1 ? te : 0)),
    // 캡션은 t = 0.5에서 문장을 바꾼다 — |1 − 2t|라 두 문장이 한순간도 겹쳐 보이지 않는다.
    caption: { index: t < 0.5 ? i : i + 1, opacity: reduced ? 1 : Math.abs(1 - 2 * t) },
    typed: i > 1 ? 1 : i === 1 ? (reduced ? 1 : h) : 0,
    badge: i > 2 || (i === 2 && (reduced || h >= 0.5)) ? 1 : 0,
  };
}
