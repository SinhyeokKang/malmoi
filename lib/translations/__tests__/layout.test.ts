import { describe, expect, it } from "vitest";
import { PANEL, planTranslationPanelLayout, SINGLE_BELOW, stepPanelWidth } from "../layout";

/**
 * 세 패널 폭 계약 (translation-rework T14 — README §7 폭 계약 · spec §3.1 · design §6).
 *
 * `로케일 = max(420, 카드영역 − 16 − (트리 + 목록))`. 모자라면 **목록(392→336) → 트리(260→208) → 트리 접힘** 순으로 준다.
 * 카드 content box가 772 미만이면 **한 판씩**이다(responsive-app design §3) — 옛 갈래(336/420 고정 + 가로 스크롤)는 375에서 편집·저장에 닿지 못했다.
 * 사용자가 끈 선호 폭은 clamp 결과로 덮지 않는다 — 넓히면 돌아온다.
 */
describe("planTranslationPanelLayout — README §7 표", () => {
  it.each([
    ["1440 · LNB 240", 1142, { tree: 260, list: 392, locale: 474 }],
    ["1440 · LNB 320", 1062, { tree: 260, list: 366, locale: 420 }],
    ["1280 · LNB 240", 982, { tree: 210, list: 336, locale: 420 }],
    ["1280 · LNB 320", 902, { tree: null, list: 466, locale: 420 }],
  ])("%s → 카드 영역 %d", (_label, area, expected) => {
    expect(planTranslationPanelLayout({ area, preferredLeft: null })).toMatchObject({ mode: "split", ...expected });
  });

  it("측정 전(폭 없음)·비정상 폭은 null이다 — 0을 넣으면 한 패널이 화면을 먹은 채 한 프레임 그려진다", () => {
    expect(planTranslationPanelLayout({ area: null, preferredLeft: null })).toBeNull();
    expect(planTranslationPanelLayout({ area: 0, preferredLeft: null })).toBeNull();
    expect(planTranslationPanelLayout({ area: -1, preferredLeft: null })).toBeNull();
    expect(planTranslationPanelLayout({ area: Number.NaN, preferredLeft: null })).toBeNull();
    expect(planTranslationPanelLayout({ area: Number.POSITIVE_INFINITY, preferredLeft: null })).toBeNull();
  });

  it("경계는 PANEL에서 나온다 — 목록 하한 + 간격 + 로케일 하한 = 772", () => {
    expect(SINGLE_BELOW).toBe(PANEL.listMin + PANEL.gap + PANEL.localeMin);
    expect(SINGLE_BELOW).toBe(772);
  });

  it("772 미만은 한 판이다 — 폭은 카드 영역 그대로, 가로 스크롤이 없다 (771 · 375 · 1)", () => {
    expect(planTranslationPanelLayout({ area: 771, preferredLeft: null })).toEqual({ mode: "single", width: 771 });
    expect(planTranslationPanelLayout({ area: 375, preferredLeft: 800 })).toEqual({ mode: "single", width: 375 });
    expect(planTranslationPanelLayout({ area: 1, preferredLeft: null })).toEqual({ mode: "single", width: 1 });
  });

  it("772 이상은 두 판이다 — 772에서 트리를 접고 목록 336 · 로케일 420, 773은 목록이 1을 받는다", () => {
    expect(planTranslationPanelLayout({ area: 772, preferredLeft: null })).toEqual({
      mode: "split", left: 336, tree: null, list: 336, locale: 420, bounds: { min: 336, max: 336 },
    });
    expect(planTranslationPanelLayout({ area: 773, preferredLeft: null })).toMatchObject({ mode: "split", left: 337, tree: null, list: 337, locale: 420 });
  });

  it("선호 폭은 한 판을 지나도 그대로다 — 좁혔다 넓히면 돌아온다(저장값을 덮지 않는다)", () => {
    expect(planTranslationPanelLayout({ area: 1500, preferredLeft: 800 })).toMatchObject({ left: 800 });
    expect(planTranslationPanelLayout({ area: 500, preferredLeft: 800 })).toEqual({ mode: "single", width: 500 });
    expect(planTranslationPanelLayout({ area: 1500, preferredLeft: 800 })).toMatchObject({ left: 800 });
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
    const bounds = (area: number) => { const layout = planTranslationPanelLayout({ area, preferredLeft: null }); return layout?.mode === "split" ? layout.bounds : null; };
    expect(bounds(1142)).toEqual({ min: 544, max: 706 });
    expect(bounds(902)).toEqual({ min: 466, max: 466 });
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
