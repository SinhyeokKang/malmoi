/**
 * 번역 화면 세 패널의 폭 계약 (translation-rework — README §7 · spec §3.1 · design §6). **잎이다** — 화면이 매 리사이즈에 부른다.
 *
 * `로케일 = max(420, 카드영역 − 16 − (트리 + 목록))`. 모자라면 **목록(392→336) → 트리(260→208) → 트리 접힘** 순으로 준다.
 * 접혀도 못 담는 폭(카드 content box 772 미만)은 **한 판씩**이다(responsive-app design §3) — 옛 갈래(336/420 + 본문 가로 스크롤)는 375에서
 * 편집·저장에 닿지 못했다. ⚠️ 판 **표시**는 CSS(`@container` + `data-pane`)가 정한다 — 이 값은 JS가 폭·포커스를 고를 때만 읽는다(측정 전 `null`).
 * ⚠️ 사용자가 끈 선호 폭(`preferredLeft`)은 **입력일 뿐 덮지 않는다** — 좁은 창의 clamp 값을 저장하면 넓혔을 때 안 돌아온다.
 */
export const PANEL = { tree: 260, treeMin: 208, list: 392, listMin: 336, localeMin: 420, gap: 16, step: 8 } as const;

const DEFAULT_LEFT = PANEL.tree + PANEL.list;
/** 이 폭 미만이면 한 판이다 — 목록 하한 + 간격 + 로케일 하한. CSS의 `@max-[772px]` 리터럴과 같은 값이다(`translations-screen.test.ts`가 대조). */
export const SINGLE_BELOW = PANEL.listMin + PANEL.gap + PANEL.localeMin;
const DRAG_MIN = PANEL.treeMin + PANEL.listMin;

export type SplitLayout = {
  mode: "split";
  /** 트리 + 목록 카드의 폭. */
  left: number;
  /** `null`이면 트리가 접혔다 — 목록 머리의 트리 버튼이 겹쳐 뜨는 패널을 연다. */
  tree: number | null;
  list: number;
  locale: number;
  /** 핸들이 움직일 수 있는 범위 — 키보드와 `aria-valuemin/max`가 같은 값을 본다. */
  bounds: { min: number; max: number };
};
/** 한 판 — 목록과 상세가 카드 영역 전체를 번갈아 쓴다. 핸들·트리 칸이 없다(트리는 접힌 팝오버). */
export type SingleLayout = { mode: "single"; width: number };
export type PanelLayout = SplitLayout | SingleLayout;

export function planTranslationPanelLayout(input: { area: number | null; preferredLeft: number | null }): PanelLayout | null {
  const { area } = input;
  if (area === null || !Number.isFinite(area) || area <= 0) return null;
  if (area < SINGLE_BELOW) return { mode: "single", width: area };
  const maxLeft = area - PANEL.gap - PANEL.localeMin;
  if (maxLeft < DRAG_MIN) {
    return { mode: "split", left: maxLeft, tree: null, list: maxLeft, locale: PANEL.localeMin, bounds: { min: maxLeft, max: maxLeft } };
  }
  const left = Math.min(maxLeft, Math.max(DRAG_MIN, input.preferredLeft ?? DEFAULT_LEFT));
  const list = Math.max(PANEL.listMin, left - PANEL.tree);
  return { mode: "split", left, tree: left - list, list, locale: area - PANEL.gap - left, bounds: { min: DRAG_MIN, max: maxLeft } };
}

/** 핸들 키보드 — ←→ 8px · Home 하한 · End 기본 폭. 모르는 키는 `null`(호출부가 기본 동작을 막지 않는다). */
export function stepPanelWidth(current: number, key: string, bounds: { min: number; max: number }): number | null {
  const clamp = (value: number) => Math.min(bounds.max, Math.max(bounds.min, value));
  switch (key) {
    case "ArrowLeft": return clamp(current - PANEL.step);
    case "ArrowRight": return clamp(current + PANEL.step);
    case "Home": return bounds.min;
    case "End": return clamp(DEFAULT_LEFT);
    default: return null;
  }
}
