// ⚠️ import는 이 줄보다 먼저 평가되지만(ESM) Node는 `Date` 연산마다 `TZ`를 다시 읽어 테스트 본문에는 걸린다 — 걸렸는지는 아래 가드가 판정한다. 런타임 TZ를 UTC가 아닌 곳(분 단위 오프셋)에 두어야 "런타임 TZ를 읽지 않는다"가 CI(UTC)에서 공허하게 통과하지 않는다.
process.env.TZ = "Asia/Kathmandu";

import { describe, expect, it } from "vitest";

import { retryAtLabel } from "../retry-at";

const UTC = { uiLocale: "en", timeZone: "UTC" } as const;

it("TZ가 실제로 카트만두다 — 이 가드가 없으면 아래 단언이 UTC 런타임에서 공허하다", () => {
  expect(new Date("2026-01-01T00:00:00Z").getTimezoneOffset()).toBe(-345);
});

/**
 * 재시도 가능 시각의 표기 — **보는 사람의 시간대로 말하는 절대 시각**(`lib/date-format.ts`의 형, user-timezone)이고 분 단위로 **올린다**.
 * 내리면 "12:00 이후에"를 보고 12:00에 눌러 다시 막힌다.
 */
describe("retryAtLabel", () => {
  it("초가 있으면 다음 분으로 올린다", () => {
    expect(retryAtLabel("2026-09-23T12:00:30.000Z", UTC)).toBe("Sep 23, 2026 12:01 UTC");
    expect(retryAtLabel("2026-09-23T12:00:00.001Z", UTC)).toBe("Sep 23, 2026 12:01 UTC");
  });

  it("정각은 그대로다", () => {
    expect(retryAtLabel("2026-09-23T12:00:00.000Z", UTC)).toBe("Sep 23, 2026 12:00 UTC");
  });

  it("자정·월말을 넘긴다", () => {
    expect(retryAtLabel("2026-09-30T23:59:10.000Z", UTC)).toBe("Oct 1, 2026 00:00 UTC");
  });

  it("보는 사람의 시간대로 말하고 오프셋을 단다 — 올림은 그대로다", () => {
    expect(retryAtLabel("2026-09-30T23:59:10.000Z", { uiLocale: "en", timeZone: "Asia/Seoul" })).toBe("Oct 1, 2026 09:00 UTC+9");
    expect(retryAtLabel("2026-09-23T12:00:30.000Z", { uiLocale: "ko", timeZone: "Asia/Kolkata" })).toBe("2026년 9월 23일 17:31 UTC+5:30");
  });
});
