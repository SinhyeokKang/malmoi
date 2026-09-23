import { describe, expect, it } from "vitest";
import { PANEL, planTranslationPanelLayout, stepPanelWidth } from "../layout";

/**
 * 세 패널 폭 계약 (translation-rework T14 — README §7 폭 계약 · spec §3.1 · design §6).
 *
 * `로케일 = max(420, 카드영역 − 16 − (트리 + 목록))`. 모자라면 **목록(392→336) → 트리(260→208) → 트리 접힘** 순으로 준다.
 * 접힌 뒤에도 772 미만이면 **본문만 가로 스크롤**이다. 사용자가 끈 선호 폭은 clamp 결과로 덮지 않는다 — 넓히면 돌아온다.
 */
describe("planTranslationPanelLayout — README §7 표", () => {
  it.each([
    ["1440 · LNB 240", 1142, { tree: 260, list: 392, locale: 474 }],
    ["1440 · LNB 320", 1062, { tree: 260, list: 366, locale: 420 }],
    ["1280 · LNB 240", 982, { tree: 210, list: 336, locale: 420 }],
    ["1280 · LNB 320", 902, { tree: null, list: 466, locale: 420 }],
  ])("%s → 카드 영역 %d", (_label, area, expected) => {
    expect(planTranslationPanelLayout({ area, preferredLeft: null })).toMatchObject({ ...expected, scrollWidth: null });
  });

  it("772 미만이면 트리를 접고 336/420 그대로 가로 스크롤이다", () => {
    expect(planTranslationPanelLayout({ area: 700, preferredLeft: null })).toEqual({
      left: 336, tree: null, list: 336, locale: 420, scrollWidth: 772, bounds: { min: 336, max: 336 },
    });
  });

  it("측정 전(폭 없음)은 null이다 — 0을 넣으면 한 패널이 화면을 먹은 채 한 프레임 그려진다", () => {
    expect(planTranslationPanelLayout({ area: null, preferredLeft: null })).toBeNull();
    expect(planTranslationPanelLayout({ area: 0, preferredLeft: null })).toBeNull();
  });

  it("상수는 시안 값이다", () => {
    expect(PANEL).toEqual({ tree: 260, treeMin: 208, list: 392, listMin: 336, localeMin: 420, gap: 16, step: 8 });
  });
});

describe("planTranslationPanelLayout — 사용자가 끈 폭", () => {
  it("선호 폭을 그 창이 담을 수 있는 만큼 쓴다 — 넓어진 목록이 폭을 받는다", () => {
    expect(planTranslationPanelLayout({ area: 1500, preferredLeft: 800 })).toMatchObject({ left: 800, tree: 260, list: 540, locale: 684 });
  });

  it("창이 좁아 담지 못하면 clamp하지만, 같은 선호 폭으로 다시 넓히면 돌아온다 — 저장값을 덮지 않는다", () => {
    expect(planTranslationPanelLayout({ area: 1142, preferredLeft: 800 })).toMatchObject({ left: 706, locale: 420 });
    expect(planTranslationPanelLayout({ area: 1500, preferredLeft: 800 })).toMatchObject({ left: 800 });
  });

  it("끌어서는 트리를 접지 않는다 — 하한은 트리 208 + 목록 336이다", () => {
    expect(planTranslationPanelLayout({ area: 1142, preferredLeft: 100 })).toMatchObject({ left: 544, tree: 208, list: 336 });
  });

  it("목록이 먼저 줄고 그다음 트리가 준다", () => {
    expect(planTranslationPanelLayout({ area: 1142, preferredLeft: 620 })).toMatchObject({ tree: 260, list: 360 });
    expect(planTranslationPanelLayout({ area: 1142, preferredLeft: 560 })).toMatchObject({ tree: 224, list: 336 });
  });

  it("핸들의 범위를 함께 준다 — 키보드와 aria-valuemin/max가 같은 값을 본다", () => {
    expect(planTranslationPanelLayout({ area: 1142, preferredLeft: null })?.bounds).toEqual({ min: 544, max: 706 });
    expect(planTranslationPanelLayout({ area: 902, preferredLeft: null })?.bounds).toEqual({ min: 466, max: 466 });
  });
});

describe("stepPanelWidth — 핸들 키보드 (README §8)", () => {
  const bounds = { min: 544, max: 706 };
  it("←→는 8px씩, 범위 밖으로 나가지 않는다", () => {
    expect(stepPanelWidth(652, "ArrowLeft", bounds)).toBe(644);
    expect(stepPanelWidth(652, "ArrowRight", bounds)).toBe(660);
    expect(stepPanelWidth(548, "ArrowLeft", bounds)).toBe(544);
    expect(stepPanelWidth(704, "ArrowRight", bounds)).toBe(706);
  });

  it("Home은 하한, End는 기본 폭(범위 안으로)이다", () => {
    expect(stepPanelWidth(652, "Home", bounds)).toBe(544);
    expect(stepPanelWidth(600, "End", bounds)).toBe(652);
    expect(stepPanelWidth(600, "End", { min: 466, max: 466 })).toBe(466);
  });

  it("다른 키는 바꾸지 않는다", () => {
    expect(stepPanelWidth(652, "Enter", bounds)).toBeNull();
  });
});
