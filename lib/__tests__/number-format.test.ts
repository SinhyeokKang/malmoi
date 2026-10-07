import { describe, expect, it } from "vitest";

import { formatNumber } from "@/lib/number-format";

describe("화면 숫자는 명시한 UI locale을 쓴다", () => {
  it.each([ ["en", "10,000"], ["ko", "10,000"], ["es", "10.000"] ] as const)("%s — 큰 수를 같은 입력으로 결정적으로 표시한다", (uiLocale, expected) => {
    expect(formatNumber(10000, uiLocale)).toBe(expected);
    expect(formatNumber(10000, uiLocale)).toBe(expected);
    expect(formatNumber(0, uiLocale)).toBe("0");
    expect(formatNumber(1, uiLocale)).toBe("1");
  });
});
