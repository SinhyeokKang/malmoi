import { panelConstraints, panelLayout, type PanelPx } from "@/lib/shell/panel-size";

/**
 * **Files 단계(새 프로젝트 ② · Add sources)의 판 판정** — 후보 목록 ↔ 샘플 표를 두 판으로 놓을지, 한 판씩
 * 순차로 보일지 (responsive-app design §4 · 시안 AT7).
 *
 * ⚠️ **입력은 핸들을 빼기 전 body content box 폭이다.** 옛 코드는 모달 1024 − `px-8` − 핸들 = 952를 고정
 * 분모로 박았는데, `lg` 미만에서 LargeModal이 뷰포트 폭 시트가 되면서(375에서 본문 343) 그 분모가 실제 폭과
 * 어긋났다. 그래서 잰 폭을 받는다.
 *
 * ⚠️ **샘플 최소 400은 옛 코드에 없던 값이다** — 표가 `table-fixed` + key `w-1/3`이라 400에서 key 133 / value
 * 267이고, 거기가 값이 읽히는 경계다. 후보 하한 200 + 핸들 8 + 400 = 608 미만은 두 판을 놓을 자리가 없다.
 *
 * I/O 없는 잎이다 — DOM을 재는 쪽은 `components/onboarding/steps/files.tsx`다.
 */

/** 후보 목록 치수 — 셸 LNB와 같은 200 / 240 / 320. */
export const FILES_CANDIDATES_PX: PanelPx = { min: 200, default: 240, max: 320 };
/** 두 판 사이 핸들 폭(`ResizableHandle className="w-2"`). */
export const FILES_HANDLE_PX = 8;
/** 샘플 표가 읽히는 최소 폭. */
export const FILES_SAMPLE_MIN_PX = 400;
/** 이 폭(핸들 포함) 미만이면 순차 판이다. */
export const FILES_SPLIT_MIN_PX = FILES_CANDIDATES_PX.min + FILES_HANDLE_PX + FILES_SAMPLE_MIN_PX;

export type FilesLayout =
  | { mode: "sequential" }
  | {
      mode: "split";
      /** 두 판이 나눠 갖는 폭 = bodyWidth − 핸들. */
      available: number;
      /** 지금 지킬 후보 폭(px) — 고른 폭을 clamp한 값. */
      candidatesPx: number;
      /** 후보 `Panel`의 %. 상한은 샘플 400을 남긴다. */
      constraints: { minSize: number; defaultSize: number; maxSize: number };
      /** `setLayout`에 넘길 두 몫(%) — `defaultSize`는 마운트에만 읽혀 폭이 바뀌면 이것으로 되돌린다. */
      layout: [number, number];
    };

/** 후보 폭 상한 — 320과 "샘플 400을 남기는 폭" 중 작은 쪽. 하한 아래로는 안 내려간다(그 폭은 순차 판이다). */
function candidatesMax(available: number): number {
  return Math.max(FILES_CANDIDATES_PX.min, Math.min(FILES_CANDIDATES_PX.max, available - FILES_SAMPLE_MIN_PX));
}

/** 사용자가 고른(또는 기본) 후보 폭을 지금 폭에서 놓일 수 있는 값으로 자른다. 비정상 값은 기본 240이다. */
export function candidatesPx(chosen: number, available: number): number {
  const px = Number.isFinite(chosen) ? chosen : FILES_CANDIDATES_PX.default;
  return Math.min(candidatesMax(available), Math.max(FILES_CANDIDATES_PX.min, px));
}

/**
 * 판 판정. **못 잰 폭(0·음수·NaN·Infinity)은 `null`** — "아직 모른다"를 0으로 읽으면 순차 판이 한 프레임 선다.
 * `chosen`은 사용자가 핸들로 고른 후보 폭(px)이고, 없으면 기본 240이다.
 */
export function filesLayout(bodyWidth: number, chosen: number = FILES_CANDIDATES_PX.default): FilesLayout | null {
  if (!Number.isFinite(bodyWidth) || bodyWidth <= 0) return null;
  if (bodyWidth < FILES_SPLIT_MIN_PX) return { mode: "sequential" };
  const available = bodyWidth - FILES_HANDLE_PX;
  const px = candidatesPx(chosen, available);
  const constraints = panelConstraints(available, { min: FILES_CANDIDATES_PX.min, default: px, max: candidatesMax(available) });
  const layout = panelLayout(available, px);
  // available ≥ 600이라 둘 다 null일 수 없다 — 타입만 좁힌다.
  if (constraints === null || layout === null) return null;
  return { mode: "split", available, candidatesPx: px, constraints, layout };
}
