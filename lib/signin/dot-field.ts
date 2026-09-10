/**
 * 로그인 우측 장식의 판정 둘 (8-1b). **잎이다 — import 0.**
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
 */
export function dotGrid(width: number, height: number, gap: number): Dot[] {
  if (gap <= 0 || width < 0 || height < 0) return [];
  const dots: Dot[] = [];
  for (let y = 0; y <= height; y += gap) {
    for (let x = 0; x <= width; x += gap) dots.push({ x, y });
  }
  return dots;
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
