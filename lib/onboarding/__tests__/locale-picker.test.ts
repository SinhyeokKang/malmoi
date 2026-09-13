import { describe, expect, it } from "vitest";

import { LOCALE_RADIO_MAX, LOCALE_SEGMENT_MAX, collapseLocalePicker } from "../locale-picker";

/**
 * ②의 세그먼트와 ③의 기준 언어가 **다른 경계**로 접힌다 (2026-09-13 사용자).
 *
 * ⚠️ **숫자를 화면에 적지 않는다** — 두 값이 여기 나란히 있어야 "왜 다른가"가 한자리에서 읽힌다.
 * 세그먼트는 가로 한 줄이라 칸이 늘면 코드가 잘리고, 라디오는 감싸므로 줄만 는다.
 */
describe("collapseLocalePicker — 인라인이냐 목록이냐", () => {
  it("세그먼트는 넷까지 펼치고 다섯부터 접는다", () => {
    expect(LOCALE_SEGMENT_MAX).toBe(4);
    expect(collapseLocalePicker(4, LOCALE_SEGMENT_MAX)).toBe(false);
    expect(collapseLocalePicker(5, LOCALE_SEGMENT_MAX)).toBe(true);
  });

  it("라디오는 열까지 펼치고 열하나부터 접는다 — 되돌릴 수 없는 결정이라 보이는 편이 낫다", () => {
    expect(LOCALE_RADIO_MAX).toBe(10);
    expect(collapseLocalePicker(10, LOCALE_RADIO_MAX)).toBe(false);
    expect(collapseLocalePicker(11, LOCALE_RADIO_MAX)).toBe(true);
  });

  it("두 경계가 다르다 — 하나로 합치면 한쪽이 반드시 틀린 형이 된다", () => {
    expect(LOCALE_SEGMENT_MAX).not.toBe(LOCALE_RADIO_MAX);
    // 다섯은 ②에서는 접히고 ③에서는 펼쳐진다 — 그 차이가 이 함수의 존재 이유다.
    expect(collapseLocalePicker(5, LOCALE_SEGMENT_MAX)).toBe(true);
    expect(collapseLocalePicker(5, LOCALE_RADIO_MAX)).toBe(false);
  });

  it("적은 쪽 끝에서도 펼친다 — 로케일 하나짜리도 자리는 선다", () => {
    expect(collapseLocalePicker(0, LOCALE_SEGMENT_MAX)).toBe(false);
    expect(collapseLocalePicker(1, LOCALE_RADIO_MAX)).toBe(false);
  });

  it("많은 쪽은 둘 다 접는다", () => {
    expect(collapseLocalePicker(57, LOCALE_SEGMENT_MAX)).toBe(true);
    expect(collapseLocalePicker(57, LOCALE_RADIO_MAX)).toBe(true);
  });
});
