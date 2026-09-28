// ⚠️ **import보다 먼저 선다** — 런타임 TZ를 UTC가 아닌 곳에 두어야 "TZ와 무관하다"가 CI(UTC)에서 공허하게 통과하지 않는다.
process.env.TZ = "Asia/Seoul";

import { expect, it } from "vitest";
import { utcDay, utcMinute } from "../utc-time";

/**
 * **절대 날짜·시각은 UTC라고 말한다** (launch-readiness L7.1 결정 — 표기는 2026-09-28에 `Sep 27, 2026` 형으로 바뀌었다).
 * 서버 렌더의 `toLocaleString`은 서버 타임존(Vercel은 UTC)일 뿐이고, 클라이언트의 로컬 표시는 라벨이 없으면
 * **보는 사람이 어느 시간대인지 모른다.**
 */
it("TZ가 실제로 서울이다 — 이 가드가 없으면 아래 단언이 UTC 런타임에서 공허하다", () => {
  expect(new Date("2026-09-27T16:34:14Z").getDate()).toBe(28);
});

it("utcDay — 월 약어 · 한 자리 날짜 · 연도, 서울 기준으론 다음 날이어도 UTC 날짜다", () => {
  expect(utcDay(new Date("2026-09-27T16:34:14Z"))).toBe("Sep 27, 2026");
  expect(utcDay(new Date("2026-01-05T00:00:00Z"))).toBe("Jan 5, 2026");
  expect(utcDay(new Date("2026-12-31T23:59:59.999Z"))).toBe("Dec 31, 2026");
  expect(utcDay(new Date("2027-01-01T08:59:00+09:00"))).toBe("Dec 31, 2026");
});

it("utcMinute — utcDay 뒤에 분 단위 24시 시각과 UTC 라벨", () => {
  expect(utcMinute(new Date("2026-09-27T16:34:14Z"))).toBe("Sep 27, 2026 16:34 UTC");
  expect(utcMinute(new Date("2026-09-10T12:00:59.999Z"))).toBe("Sep 10, 2026 12:00 UTC");
  expect(utcMinute(new Date("2026-09-10T23:59:00+09:00"))).toBe("Sep 10, 2026 14:59 UTC");
  expect(utcMinute(new Date("2026-01-01T00:05:00Z"))).toBe("Jan 1, 2026 00:05 UTC");
});
