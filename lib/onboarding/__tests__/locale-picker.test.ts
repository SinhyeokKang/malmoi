import { describe, expect, it } from "vitest";

import { LOCALE_PICKER_INLINE_MAX, collapseLocalePicker } from "../locale-picker";

/**
 * ②의 세그먼트와 ③의 기준 언어가 **같은 경계**로 접힌다 (2026-09-13).
 *
 * ⚠️ **숫자를 두 화면에 각각 적지 않는다.** 같은 값(로케일)을 고르는 컨트롤이 단계마다 다른 형이면
 * 사용자가 두 번 배우고, 한쪽 임계값만 바뀌면 그 차이가 조용히 굳는다 — excalidraw 포크(57로케일)
 * 실물에서 ②는 `Select`인데 ③은 라디오 57개가 펼쳐졌다.
 */
describe("collapseLocalePicker — 인라인이냐 목록이냐", () => {
  it("경계가 넷이다 — 넷까지는 펼치고 다섯부터 접는다", () => {
    expect(LOCALE_PICKER_INLINE_MAX).toBe(4);
    expect(collapseLocalePicker(4)).toBe(false);
    expect(collapseLocalePicker(5)).toBe(true);
  });

  it("적은 쪽 끝에서도 펼친다 — 로케일 하나짜리도 자리는 선다", () => {
    expect(collapseLocalePicker(0)).toBe(false);
    expect(collapseLocalePicker(1)).toBe(false);
  });

  it("많은 쪽은 전부 접는다", () => {
    expect(collapseLocalePicker(57)).toBe(true);
  });
});
