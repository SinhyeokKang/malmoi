import { describe, expect, it } from "vitest";

import { panelConstraints, panelLayout, panelPercent } from "../panel-size";

/**
 * **`react-resizable-panels`의 `minSize`·`defaultSize`·`maxSize`는 % 전용이다** (v2 `Panel.d.ts`:
 * 셋 다 `number | undefined`이고 px 짝이 없다). 그런데 우리가 정한 치수는 px이고 — LNB 200/240/320 —
 * 그룹 폭은 뷰포트를 따라 변한다. **고정 %를 박으면 큰 모니터에서 LNB가 같이 커진다**: 1264 기준
 * 18.99%를 2560 디스플레이에 그대로 쓰면 486px이다. 그래서 px → %는 **잰 폭마다 다시** 계산한다.
 *
 * ⚠️ **분모가 그룹 폭이 아니라 "핸들을 뺀 폭"이다.** 라이브러리는 패널에 `flex-basis: 0` +
 * `flex-grow: <size>`를 걸고 핸들은 **자기 폭을 가진 별도 flex 항목**이라, 패널들이 실제로 나눠 갖는
 * 것은 `그룹 폭 − 핸들 폭`이다. 그룹 폭으로 나누면 LNB가 핸들 폭만큼 좁아진다(1264에서 8px).
 */
describe("panelPercent — px를 그룹 안 비율로", () => {
  it("나눠 가질 폭 대비 비율을 낸다", () => {
    expect(panelPercent(720, 240)).toBeCloseTo(33.3333, 4);
    expect(panelPercent(720, 200)).toBeCloseTo(27.7778, 4);
    expect(panelPercent(720, 320)).toBeCloseTo(44.4444, 4);
  });

  it("폭이 자라면 같은 px의 비율이 줄어든다 — 고정 %가 하지 못하는 일이다", () => {
    // 1280 뷰포트(그룹 1264, 핸들 8)와 2560 뷰포트에서 240px이 갖는 비율.
    expect(panelPercent(1264 - 8, 240)).toBeCloseTo(19.1083, 4);
    expect(panelPercent(2544 - 8, 240)).toBeCloseTo(9.4637, 4);
  });

  /** px가 나눠 가질 폭을 넘으면 100을 넘길 수 없다 — 라이브러리가 `defaultSize > 100`을 던진다. */
  it("0과 100 사이로 자른다", () => {
    expect(panelPercent(200, 320)).toBe(100);
    expect(panelPercent(720, -10)).toBe(0);
  });
});

describe("panelConstraints — 세 치수를 한 번에", () => {
  const PX = { min: 200, default: 240, max: 320 } as const;

  it("모달 2단계의 고정 폭 720을 % 셋으로 바꾼다", () => {
    const c = panelConstraints(720, PX);
    expect(c).not.toBeNull();
    expect(c?.minSize).toBeCloseTo(27.7778, 4);
    expect(c?.defaultSize).toBeCloseTo(33.3333, 4);
    expect(c?.maxSize).toBeCloseTo(44.4444, 4);
  });

  /**
   * ⚠️ **못 잰 폭을 0으로 취급하지 않는다.** 0을 넣으면 세 값이 전부 100이 되고, 그러면 LNB가
   * 화면을 통째로 먹은 채로 한 프레임 그려진다 — "아직 모른다"와 "0이다"는 다르다.
   */
  it("잴 수 없는 폭에는 null을 준다 — 호출부가 px 폴백으로 떨어진다", () => {
    expect(panelConstraints(0, PX)).toBeNull();
    expect(panelConstraints(-1, PX)).toBeNull();
    expect(panelConstraints(Number.NaN, PX)).toBeNull();
    expect(panelConstraints(Number.POSITIVE_INFINITY, PX)).toBeNull();
  });

  /** 자르기가 단조라 순서는 어떤 폭에서도 유지된다 — 라이브러리는 `defaultSize < minSize`도 던진다. */
  it("좁은 폭에서도 min ≤ default ≤ max가 유지된다", () => {
    for (const width of [120, 250, 400, 720, 1256, 4000]) {
      const c = panelConstraints(width, PX);
      expect(c, String(width)).not.toBeNull();
      expect(c!.minSize).toBeLessThanOrEqual(c!.defaultSize);
      expect(c!.defaultSize).toBeLessThanOrEqual(c!.maxSize);
      expect(c!.maxSize).toBeLessThanOrEqual(100);
    }
  });
});

/**
 * ⚠️ **`defaultSize`는 마운트 시점에만 쓰인다** (2026-09-15 실물 검증). 재고 나서 prop을 고쳐도
 * 이미 놓인 패널은 움직이지 않아, LNB가 1280에서 240 · 1440에서 270 · 1920에서 320(상한)으로
 * **뷰포트를 따라 커졌다.** 그래서 폭이 바뀔 때마다 이 함수로 %를 다시 내 `setLayout`에 넘긴다 —
 * 지키는 것은 %가 아니라 **px**다.
 */
describe("panelLayout", () => {
  it("폭이 달라져도 같은 px를 낸다", () => {
    for (const available of [1256, 1416, 1896, 2536]) {
      const layout = panelLayout(available, 240);
      expect(layout).not.toBeNull();
      expect(((layout?.[0] ?? 0) / 100) * available).toBeCloseTo(240, 6);
    }
  });

  it("두 몫의 합이 언제나 100이다 — 라이브러리가 그것을 요구한다", () => {
    for (const px of [0, 200, 240, 320, 99_999]) {
      const layout = panelLayout(1416, px);
      expect((layout?.[0] ?? 0) + (layout?.[1] ?? 0)).toBeCloseTo(100, 10);
    }
  });

  it("못 잰 폭에는 null이다 — 0으로 나누면 100%가 된다", () => {
    expect(panelLayout(0, 240)).toBeNull();
    expect(panelLayout(Number.NaN, 240)).toBeNull();
  });
});
