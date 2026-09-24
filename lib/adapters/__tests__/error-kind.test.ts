import { describe, expect, it } from "vitest";

import { ADAPTER_ERROR_CODES, adapterErrorKind } from "../types";

/**
 * **어댑터 오류 코드 → 적재 판정** (B2 r3, 2026-09-24 — ARCHITECTURE §1.1 표). `unmanaged`는 "malmoi가 일부러
 * 관리하지 않는 항목"이다: 수술적 writer가 파일에 **그대로 남기므로** 번역을 잃지 않는다. 그것이 섞였다고 적재를
 * `partial-import`로 보면 904키가 다 들어간 소스가 "Last sync failed"로 선다(QA5).
 * 나머지는 전부 실패다 — 파일을 못 읽었거나, 재생성 writer(`json-catalog`·`chrome-locales`)가 다음 Publish에서
 * 그 값을 **지우는** 갈래다.
 */
describe("adapterErrorKind", () => {
  it("코드에 남는 넷만 unmanaged다", () => {
    expect(ADAPTER_ERROR_CODES.filter(code => adapterErrorKind(code) === "unmanaged")).toEqual([
      "value-not-string",
      "value-not-string-literal",
      "shorthand-property",
      "not-property-assignment",
    ]);
  });

  // 대조: 실패로 남아야 하는 대표 — 파일 층 · 다운로드 · 중복 · 재생성 writer가 잃는 값.
  it.each(["parse-failed", "parse-crashed", "root-not-object", "no-default-export", "download-failed", "duplicate-key",
    "value-not-string-or-container", "value-not-message-object", "missing-message-field", "invalid-chrome-key"] as const)("%s는 failure다", code => {
    expect(adapterErrorKind(code)).toBe("failure");
  });
});
