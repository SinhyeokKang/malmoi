/**
 * **px 치수를 `react-resizable-panels`가 받는 %로 바꾼다.**
 *
 * ⚠️ **그 라이브러리의 `minSize`·`defaultSize`·`maxSize`는 % 전용이다** (v2 `Panel.d.ts` — 셋 다
 * `number | undefined`이고 px 짝이 없다). 우리가 정한 치수는 px이므로 어딘가에서 한 번 환산해야
 * 하는데, **고정 %를 박으면 큰 모니터에서 패널이 같이 커진다** — 1264 기준 18.99%는 2560
 * 디스플레이에서 486px이다. 그래서 그룹 폭을 잰 뒤 그 폭마다 다시 계산한다.
 *
 * ⚠️ **분모가 그룹 폭이 아니라 "핸들을 뺀 폭"이다.** 라이브러리는 패널에 `flex-basis: 0` +
 * `flex-grow: <size>`를 걸고 **핸들은 자기 폭을 가진 별도 flex 항목**이라, 패널들이 실제로 나눠
 * 갖는 것은 `그룹 폭 − 핸들 폭`이다. 그룹 폭으로 나누면 패널이 핸들 폭만큼 좁아진다.
 *
 * I/O가 없는 순수 함수다 — DOM을 재는 쪽(`components/shell/shell-panels.tsx`)과 분리해 둔 이유가
 * 그것이고, `__tests__/panel-size.test.ts`가 이 층에서 판정한다.
 */

/** 한 패널의 px 치수 셋. */
export type PanelPx = { readonly min: number; readonly default: number; readonly max: number };

/** 패널들이 나눠 갖는 폭(px) 안에서 `px`가 차지하는 비율(%). 0~100으로 자른다. */
export function panelPercent(available: number, px: number): number {
  return Math.min(100, Math.max(0, (px / available) * 100));
}

/**
 * 세 치수를 한 번에. **못 잰 폭에는 `null`** — 0을 넣으면 셋이 전부 100이 되어 패널 하나가 화면을
 * 통째로 먹은 채 한 프레임 그려진다. "아직 모른다"와 "0이다"는 다르다.
 */
export function panelConstraints(
  available: number,
  px: PanelPx,
): { minSize: number; defaultSize: number; maxSize: number } | null {
  if (!Number.isFinite(available) || available <= 0) return null;
  return {
    minSize: panelPercent(available, px.min),
    defaultSize: panelPercent(available, px.default),
    maxSize: panelPercent(available, px.max),
  };
}
