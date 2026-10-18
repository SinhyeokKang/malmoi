/**
 * 로그인 우측 장식(8-1b)과 랜딩 배경(landing-kv-background)의 판정. **잎이다 — import 0.**
 *
 * ⚠️ **왜 Canvas인가**: 시안은 커서 주변 도트가 스케일하는데, `background-image: radial-gradient`는
 * **개별 도트가 요소가 아니라** 스케일 대상이 없다. DOM으로 그리면 948×1064 / 16px ≈ **4,000개
 * 요소**라 리페인트로 죽는다. Canvas는 4,000개 `arc()`가 프레임당 1~3ms다.
 *
 * ⚠️ **그리기는 여기 없다** — `ctx.arc()`는 I/O다. 이 파일은 좌표와 반지름까지만 든다.
 */

/** 도트 좌표 하나. */
export type Dot = { x: number; y: number };

/**
 * 캔버스 크기 → 격자 좌표.
 *
 * ⚠️ **경계를 포함한다** — 안 포함하면 캔버스 오른쪽·아래에 gap만큼 빈 띠가 생기고, 그 띠는
 * 패널 가장자리라 눈에 띄는 자리다.
 *
 * ⚠️ **gap이 0 이하면 빈 배열이다.** 이 함수는 `ResizeObserver` 콜백에서 불리므로 무한 루프
 * 한 번이 탭을 얼린다.
 *
 * `offsetY`는 랜딩의 스크롤 격자다(landing-kv-background R6) — 한 화면짜리 sticky 캔버스에서 행을 `-(offsetY % gap)`부터
 * 그려 점이 콘텐츠에 박힌 것처럼 올라간다. 그때는 아래 끝 행이 높이 이상까지 간다(행이 위로 밀린 만큼 아래가 비지 않게).
 * ⚠️ **0이면 지금 출력과 바이트 단위로 같다** — 로그인은 이 인자를 넘기지 않는다. ⚠️ Safari 고무줄 스크롤은 `scrollTop`을
 * 음수로 주므로 나머지를 양수로 접는다. 유한하지 않으면 0으로 읽는다(`NaN` 좌표가 캔버스에 가면 그 프레임이 빈다).
 */
export function dotGrid(width: number, height: number, gap: number, offsetY = 0): Dot[] {
  if (gap <= 0 || width < 0 || height < 0) return [];
  const shift = Number.isFinite(offsetY) ? ((offsetY % gap) + gap) % gap : 0;
  const rows: number[] = [];
  if (shift === 0) {
    for (let y = 0; y <= height; y += gap) rows.push(y);
  } else {
    for (let y = -shift; y < height + gap; y += gap) rows.push(y);
  }
  const dots: Dot[] = [];
  for (const y of rows) {
    for (let x = 0; x <= width; x += gap) dots.push({ x, y });
  }
  return dots;
}

/**
 * 커서 반경 안/밖으로 가른다 — 랜딩의 묶음 그리기 입력(landing-kv-background R8). 밖의 점은 반지름·알파가 모두 기본값이라
 * path 하나에 모아 fill 한 번으로 칠한다(2560×1440 ≈ 1만 3천 개).
 *
 * ⚠️ **경계는 `dotScale`과 같다** — 거리가 `radius` 이상이면 밖이다. 둘이 갈리면 묶음 그리기가 점마다 그리기와 다른 픽셀을 낸다.
 */
export function partitionDots(dots: Dot[], spot: Dot | null, radius: number): { near: Dot[]; far: Dot[] } {
  if (spot === null || radius <= 0) return { near: [], far: dots };
  const near: Dot[] = [];
  const far: Dot[] = [];
  for (const dot of dots) {
    (Math.hypot(dot.x - spot.x, dot.y - spot.y) < radius ? near : far).push(dot);
  }
  return { near, far };
}

/**
 * 커서까지의 거리 → 반지름. 반경 밖은 기본 크기이고 커서 바로 아래가 가장 크다.
 *
 * ⚠️ **선형 보간이다.** 커서 주위에 링이 생기지 않으려면 단조여야 하고, 그 이상의 곡선은
 * 이 장식에 값을 더하지 않는다.
 *
 * ⚠️ **반경 0에서 나눗셈이 무너진다** — 전부 기본 크기로 접는다(`NaN`이 캔버스에 가면
 * 그 프레임이 통째로 빈다).
 */
export function dotScale(distance: number, radius: number, base: number, max: number): number {
  if (radius <= 0 || distance >= radius) return base;
  return base + (max - base) * (1 - distance / radius);
}

/**
 * 자동 재생용 **가상 커서 위치** — 경과 시간(ms) → 좌표 (8-1b).
 *
 * ⚠️ **ㄹ자(boustrophedon)다** — 왼→오른, 한 줄 내려가, 오른→왼. 대각선이나 원형은 "무엇이
 * 지나간다"로 안 읽히고 화면을 가로지르는 스캔이라야 도트가 순서대로 밝아진다.
 *
 * ⚠️ **줄과 줄 사이에 세로 전환 구간이 있다** — 없으면 `y`가 줄 인덱스로만 정해져 줄이 바뀌는
 * 순간 **순간이동**한다(2026-09-10 사용자: "열 이동은 연결이 안 됨"). 가로 이동과 세로 이동을
 * 번갈아 하면 경로가 끊기지 않는다.
 *
 * ⚠️ **순수 함수인 것이 요지다.** 시간을 인자로 받으므로 rAF 없이 값만 검증할 수 있고,
 * 컴포넌트는 `performance.now()`를 넣어 부르기만 한다.
 *
 * @param elapsed 시작 후 경과 ms
 * @param width   순회할 폭
 * @param height  순회할 높이
 * @param speed   px/초 — 가로·세로 같은 속도로 움직여야 코너에서 속도가 안 튄다
 * @param rows    세로로 몇 줄을 훑는가
 */
export function autoCursor(
  elapsed: number,
  width: number,
  height: number,
  speed: number,
  rows: number,
): Dot {
  if (width <= 0 || height <= 0 || speed <= 0 || rows <= 0) return { x: 0, y: 0 };
  if (rows === 1) return { x: legWithin(elapsed, width, speed, 0), y: height / 2 };

  /** 줄 간격 — 세로 전환 구간의 길이이기도 하다. */
  const step = height / (rows - 1);
  const acrossMs = (width / speed) * 1000;
  const downMs = (step / speed) * 1000;

  /** 한 줄(가로) + 한 번의 줄바꿈(세로)이 한 묶음이고, 마지막 줄 뒤에는 줄바꿈이 없다. */
  const cycle = rows * acrossMs + (rows - 1) * downMs;
  const t = ((elapsed % cycle) + cycle) % cycle;

  let remaining = t;
  for (let row = 0; row < rows; row++) {
    if (remaining < acrossMs) {
      return { x: legWithin(remaining, width, speed, row), y: row * step };
    }
    remaining -= acrossMs;
    if (row === rows - 1) break;
    if (remaining < downMs) {
      // 세로 전환 — x는 방금 끝난 줄의 끝에 머문다(그래야 코너가 직각으로 이어진다).
      return { x: row % 2 === 0 ? width : 0, y: row * step + (remaining / downMs) * step };
    }
    remaining -= downMs;
  }
  return { x: (rows - 1) % 2 === 0 ? width : 0, y: height };
}

/** 한 줄 안에서의 가로 위치. 홀수 줄은 오른쪽에서 왼쪽으로 — 그것이 ㄹ자를 만든다. */
function legWithin(elapsed: number, width: number, speed: number, row: number): number {
  const progress = Math.min(1, (elapsed / 1000) * speed / width);
  return row % 2 === 0 ? progress * width : width - progress * width;
}
