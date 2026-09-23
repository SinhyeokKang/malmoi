import { describe, expect, it } from "vitest";

import { retryAtLabel } from "../retry-at";

/**
 * 재시도 가능 시각의 표기 — **UTC 절대 시각**(`lib/utc-time.ts`의 형)이고 분 단위로 **올린다**.
 * 내리면 "12:00 이후에"를 보고 12:00에 눌러 다시 막힌다.
 */
describe("retryAtLabel", () => {
  it("초가 있으면 다음 분으로 올린다", () => {
    expect(retryAtLabel("2026-09-23T12:00:30.000Z")).toBe("2026-09-23 12:01 UTC");
    expect(retryAtLabel("2026-09-23T12:00:00.001Z")).toBe("2026-09-23 12:01 UTC");
  });

  it("정각은 그대로다", () => {
    expect(retryAtLabel("2026-09-23T12:00:00.000Z")).toBe("2026-09-23 12:00 UTC");
  });

  it("자정·월말을 넘긴다", () => {
    expect(retryAtLabel("2026-09-30T23:59:10.000Z")).toBe("2026-10-01 00:00 UTC");
  });
});
