// ⚠️ **import보다 먼저 선다** — 런타임 TZ를 UTC가 아닌 곳에 두어야 "TZ와 무관하다"가 CI(UTC)에서 공허하게 통과하지 않는다.
process.env.TZ = "Asia/Seoul";

import { expect, it } from "vitest";
import { utcDay, utcMinute, utcMonth } from "../utc-time";

/**
 * **절대 날짜·시각은 UTC라고 말한다** (launch-readiness L7.1 결정 — 표기는 2026-09-28에 `Sep 27, 2026` 형으로 바뀌었다).
 * 서버 렌더의 `toLocaleString`은 서버 타임존(Vercel은 UTC)일 뿐이고, 클라이언트의 로컬 표시는 라벨이 없으면
 * **보는 사람이 어느 시간대인지 모른다.**
 */
it("TZ가 실제로 서울이다 — 이 가드가 없으면 아래 단언이 UTC 런타임에서 공허하다", () => {
  expect(new Date("2026-09-27T16:34:14Z").getDate()).toBe(28);
});

it("utcDay — 월 약어 · 한 자리 날짜 · 연도, 서울 기준으론 다음 날이어도 UTC 날짜다", () => {
  expect(utcDay(new Date("2026-09-27T16:34:14Z"), "en")).toBe("Sep 27, 2026");
  expect(utcDay(new Date("2026-01-05T00:00:00Z"), "en")).toBe("Jan 5, 2026");
  expect(utcDay(new Date("2026-12-31T23:59:59.999Z"), "en")).toBe("Dec 31, 2026");
  expect(utcDay(new Date("2027-01-01T08:59:00+09:00"), "en")).toBe("Dec 31, 2026");
});

it("utcMinute — utcDay 뒤에 분 단위 24시 시각과 UTC 라벨", () => {
  expect(utcMinute(new Date("2026-09-27T16:34:14Z"), "en")).toBe("Sep 27, 2026 16:34 UTC");
  expect(utcMinute(new Date("2026-09-10T12:00:59.999Z"), "en")).toBe("Sep 10, 2026 12:00 UTC");
  expect(utcMinute(new Date("2026-09-10T23:59:00+09:00"), "en")).toBe("Sep 10, 2026 14:59 UTC");
  expect(utcMinute(new Date("2026-01-01T00:05:00Z"), "en")).toBe("Jan 1, 2026 00:05 UTC");
});

it("utcMonth — 월 약어와 연도만, 서울 기준으론 다음 달이어도 UTC 달이다", () => {
  expect(utcMonth(new Date("2026-09-27T16:34:14Z"), "en")).toBe("Sep 2026");
  expect(utcMonth(new Date("2026-01-01T08:59:00+09:00"), "en")).toBe("Dec 2025");
  expect(utcMonth(new Date("2026-12-31T23:59:59.999Z"), "en")).toBe("Dec 2026");
});

/**
 * **화면 언어별 형식이고, 세 언어 모두 UTC라고 말한다**(ui-locales spec 완료 조건 9). 형식은 손으로 만든다 — 머리 주석의
 * `Intl` 날짜 포맷터 배제를 그대로 따른다. 경계(자정·월말·연말)는 언어와 무관하게 UTC 기준이다.
 */
it.each([
  // [시각, en, ko, es] — utcDay
  ["2026-09-27T16:34:14Z", "Sep 27, 2026", "2026년 9월 27일", "27 sept 2026"],
  ["2026-01-05T00:00:00Z", "Jan 5, 2026", "2026년 1월 5일", "5 ene 2026"],
  ["2027-01-01T08:59:00+09:00", "Dec 31, 2026", "2026년 12월 31일", "31 dic 2026"], // 서울로는 새해지만 UTC로는 연말
  ["2026-03-01T00:30:00+09:00", "Feb 28, 2026", "2026년 2월 28일", "28 feb 2026"], // 월말 경계
])("utcDay %s → en %s · ko %s · es %s", (iso, en, ko, es) => {
  const at = new Date(iso);
  expect(utcDay(at, "en")).toBe(en);
  expect(utcDay(at, "ko")).toBe(ko);
  expect(utcDay(at, "es")).toBe(es);
});

it.each([
  ["2026-09-27T16:34:14Z", "Sep 27, 2026 16:34 UTC", "2026년 9월 27일 16:34 UTC", "27 sept 2026 16:34 UTC"],
  ["2026-01-01T00:05:00Z", "Jan 1, 2026 00:05 UTC", "2026년 1월 1일 00:05 UTC", "1 ene 2026 00:05 UTC"], // 자정 직후
  ["2026-09-10T23:59:00+09:00", "Sep 10, 2026 14:59 UTC", "2026년 9월 10일 14:59 UTC", "10 sept 2026 14:59 UTC"],
])("utcMinute %s → en %s · ko %s · es %s", (iso, en, ko, es) => {
  const at = new Date(iso);
  expect(utcMinute(at, "en")).toBe(en);
  expect(utcMinute(at, "ko")).toBe(ko);
  expect(utcMinute(at, "es")).toBe(es);
});

it.each([
  ["2026-09-27T16:34:14Z", "Sep 2026", "2026년 9월", "sept 2026"],
  ["2026-01-01T08:59:00+09:00", "Dec 2025", "2025년 12월", "dic 2025"],
  ["2026-05-15T12:00:00Z", "May 2026", "2026년 5월", "may 2026"],
])("utcMonth %s → en %s · ko %s · es %s", (iso, en, ko, es) => {
  const at = new Date(iso);
  expect(utcMonth(at, "en")).toBe(en);
  expect(utcMonth(at, "ko")).toBe(ko);
  expect(utcMonth(at, "es")).toBe(es);
});

it("es 월 약어 열둘이 CLDR 형이다(ene·…·sept·…·dic)", () => {
  const months = Array.from({ length: 12 }, (_, i) => utcMonth(new Date(Date.UTC(2026, i, 15)), "es").split(" ")[0]);
  expect(months).toEqual(["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]);
});
