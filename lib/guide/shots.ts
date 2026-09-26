/**
 * 촬영 매핑 표(`guide/SHOOTING.md` `#shots`)의 치수 → 렌더러의 `<img width height>`. 부분 크롭이라 에셋마다 치수가
 * 다르다 — 고유 크기가 없으면 이미지가 로드될 때 본문이 밀린다(CLS).
 *
 * ⚠️ 한국어 열 이름을 여기서 읽지 않는다 — `lib/`는 `no-korean-ui`가 훑는다. 열 → 필드 매핑은 로더의 몫이다.
 */

export type ShotSize = { width: number; height: number };

/** `WxH`(양의 정수) — 그 밖은 null이고 렌더러는 치수 없이 그린다. 값의 참은 이미지 게이트가 파일과 대조한다. */
export function parseShotSize(cell: string): ShotSize | null {
  const match = /^([1-9]\d*)x([1-9]\d*)$/.exec(cell.trim());
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

/** 에셋 경로 → 치수. 경로는 원고가 정한 값이라 프로토타입을 끊는다 — 조회는 `Object.hasOwn`으로. */
export function shotSizes(rows: readonly { asset: string; size: string }[]): Record<string, ShotSize> {
  const out: Record<string, ShotSize> = Object.create(null);
  for (const { asset, size } of rows) {
    const parsed = parseShotSize(size);
    if (asset !== "" && parsed !== null) out[asset] = parsed;
  }
  return out;
}
