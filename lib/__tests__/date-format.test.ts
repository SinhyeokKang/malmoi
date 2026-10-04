// ⚠️ **import보다 먼저 선다** — 런타임 TZ를 UTC가 아닌 곳(분 단위 오프셋)에 두어야 "TZ와 무관하다"가 CI(UTC)에서 공허하게 통과하지 않는다.
process.env.TZ = "Asia/Kathmandu";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { UiLocale } from "@/lib/i18n/locales";
import type { TimeZone } from "@/lib/time-zone/zones";

import {
  addDays,
  dayKeyAt,
  formatClock,
  formatDay,
  formatDayKey,
  formatMinute,
  formatMonth,
  offsetLabel,
  startOfDay,
  utcOffsetMinutes,
  zonedParts,
} from "../date-format";

const style = (uiLocale: UiLocale, timeZone: TimeZone = "UTC") => ({ uiLocale, timeZone });

it("TZ가 실제로 카트만두다 — 이 가드가 없으면 아래 단언이 UTC 런타임에서 공허하다", () => {
  expect(new Date("2026-09-27T16:34:14Z").getTimezoneOffset()).toBe(-345);
  expect(new Date("2026-09-27T20:00:00Z").getDate()).toBe(28);
});

/**
 * ① **`timeZone: "UTC"`는 옛 `utcDay`·`utcMinute`·`utcMonth`와 같은 문자열이다**(user-timezone 완료 조건 1 — 기본값 UTC의 화면이 바뀌지 않는다).
 * 아래 표는 옛 `utc-time.test.ts`의 표를 그대로 옮긴 것이다. 경계(자정·월말·연말)는 런타임 TZ와 무관하게 UTC 기준이다.
 */
describe("UTC — 옛 utc-time 기댓값 그대로", () => {
  it("formatDay — 월 약어 · 한 자리 날짜 · 연도, 카트만두 기준으론 다음 날이어도 UTC 날짜다", () => {
    expect(formatDay(new Date("2026-09-27T20:34:14Z"), style("en"))).toBe("Sep 27, 2026");
    expect(formatDay(new Date("2026-01-05T00:00:00Z"), style("en"))).toBe("Jan 5, 2026");
    expect(formatDay(new Date("2026-12-31T23:59:59.999Z"), style("en"))).toBe("Dec 31, 2026");
    expect(formatDay(new Date("2027-01-01T08:59:00+09:00"), style("en"))).toBe("Dec 31, 2026");
  });

  it("formatMinute — 날짜 뒤에 분 단위 24시 시각과 UTC 라벨", () => {
    expect(formatMinute(new Date("2026-09-27T16:34:14Z"), style("en"))).toBe("Sep 27, 2026 16:34 UTC");
    expect(formatMinute(new Date("2026-09-10T12:00:59.999Z"), style("en"))).toBe("Sep 10, 2026 12:00 UTC");
    expect(formatMinute(new Date("2026-09-10T23:59:00+09:00"), style("en"))).toBe("Sep 10, 2026 14:59 UTC");
    expect(formatMinute(new Date("2026-01-01T00:05:00Z"), style("en"))).toBe("Jan 1, 2026 00:05 UTC");
  });

  it("formatMonth — 월 약어와 연도만, 서울 기준으론 다음 달이어도 UTC 달이다", () => {
    expect(formatMonth(new Date("2026-09-27T16:34:14Z"), style("en"))).toBe("Sep 2026");
    expect(formatMonth(new Date("2026-01-01T08:59:00+09:00"), style("en"))).toBe("Dec 2025");
    expect(formatMonth(new Date("2026-12-31T23:59:59.999Z"), style("en"))).toBe("Dec 2026");
  });

  it.each([
    // [시각, en, ko, es] — formatDay
    ["2026-09-27T16:34:14Z", "Sep 27, 2026", "2026년 9월 27일", "27 sept 2026"],
    ["2026-01-05T00:00:00Z", "Jan 5, 2026", "2026년 1월 5일", "5 ene 2026"],
    ["2027-01-01T08:59:00+09:00", "Dec 31, 2026", "2026년 12월 31일", "31 dic 2026"], // 서울로는 새해지만 UTC로는 연말
    ["2026-03-01T00:30:00+09:00", "Feb 28, 2026", "2026년 2월 28일", "28 feb 2026"], // 월말 경계
  ])("formatDay %s → en %s · ko %s · es %s", (iso, en, ko, es) => {
    const at = new Date(iso);
    expect(formatDay(at, style("en"))).toBe(en);
    expect(formatDay(at, style("ko"))).toBe(ko);
    expect(formatDay(at, style("es"))).toBe(es);
  });

  it.each([
    ["2026-09-27T16:34:14Z", "Sep 27, 2026 16:34 UTC", "2026년 9월 27일 16:34 UTC", "27 sept 2026 16:34 UTC"],
    ["2026-01-01T00:05:00Z", "Jan 1, 2026 00:05 UTC", "2026년 1월 1일 00:05 UTC", "1 ene 2026 00:05 UTC"], // 자정 직후
    ["2026-09-10T23:59:00+09:00", "Sep 10, 2026 14:59 UTC", "2026년 9월 10일 14:59 UTC", "10 sept 2026 14:59 UTC"],
  ])("formatMinute %s → en %s · ko %s · es %s", (iso, en, ko, es) => {
    const at = new Date(iso);
    expect(formatMinute(at, style("en"))).toBe(en);
    expect(formatMinute(at, style("ko"))).toBe(ko);
    expect(formatMinute(at, style("es"))).toBe(es);
  });

  it.each([
    ["2026-09-27T16:34:14Z", "Sep 2026", "2026년 9월", "sept 2026"],
    ["2026-01-01T08:59:00+09:00", "Dec 2025", "2025년 12월", "dic 2025"],
    ["2026-05-15T12:00:00Z", "May 2026", "2026년 5월", "may 2026"],
  ])("formatMonth %s → en %s · ko %s · es %s", (iso, en, ko, es) => {
    const at = new Date(iso);
    expect(formatMonth(at, style("en"))).toBe(en);
    expect(formatMonth(at, style("ko"))).toBe(ko);
    expect(formatMonth(at, style("es"))).toBe(es);
  });

  it("es 월 약어 열둘이 CLDR 형이다(ene·…·sept·…·dic)", () => {
    const months = Array.from({ length: 12 }, (_, i) => formatMonth(new Date(Date.UTC(2026, i, 15)), style("es")).split(" ")[0]);
    expect(months).toEqual(["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]);
  });
});

// ② 고른 시간대의 부품과 오프셋 라벨.
describe("고른 시간대", () => {
  it.each([
    ["2026-10-04T23:10:00Z", "Asia/Seoul", "Oct 5, 2026 08:10 UTC+9", "2026년 10월 5일 08:10 UTC+9", "5 oct 2026 08:10 UTC+9"],
    ["2026-01-15T12:00:00Z", "Asia/Kolkata", "Jan 15, 2026 17:30 UTC+5:30", "2026년 1월 15일 17:30 UTC+5:30", "15 ene 2026 17:30 UTC+5:30"],
    ["2026-01-15T12:00:00Z", "Asia/Kathmandu", "Jan 15, 2026 17:45 UTC+5:45", "2026년 1월 15일 17:45 UTC+5:45", "15 ene 2026 17:45 UTC+5:45"],
    ["2026-01-15T03:00:00Z", "America/New_York", "Jan 14, 2026 22:00 UTC-5", "2026년 1월 14일 22:00 UTC-5", "14 ene 2026 22:00 UTC-5"],
    ["2026-07-15T03:00:00Z", "America/New_York", "Jul 14, 2026 23:00 UTC-4", "2026년 7월 14일 23:00 UTC-4", "14 jul 2026 23:00 UTC-4"],
    // 오프셋 0인 시간대의 겨울 — 라벨은 `UTC`다(옵션 라벨의 `UTC+0`과 다르다).
    ["2026-01-15T12:00:00Z", "Europe/London", "Jan 15, 2026 12:00 UTC", "2026년 1월 15일 12:00 UTC", "15 ene 2026 12:00 UTC"],
  ] as const)("formatMinute %s @ %s", (iso, zone, en, ko, es) => {
    const at = new Date(iso);
    expect(formatMinute(at, style("en", zone))).toBe(en);
    expect(formatMinute(at, style("ko", zone))).toBe(ko);
    expect(formatMinute(at, style("es", zone))).toBe(es);
  });

  it("④ 날짜 경계 — 2026-10-04T23:10Z는 서울에서 10월 5일, 뉴욕에서 10월 4일이다", () => {
    const at = new Date("2026-10-04T23:10:00Z");
    expect(formatDay(at, style("en", "Asia/Seoul"))).toBe("Oct 5, 2026");
    expect(formatDay(at, style("en", "America/New_York"))).toBe("Oct 4, 2026");
    expect(formatDay(at, style("en"))).toBe("Oct 4, 2026");
  });

  it("formatMonth — 서울에서 1월 31일 밤 UTC는 2월이다", () => {
    expect(formatMonth(new Date("2026-01-31T15:30:00Z"), style("en", "Asia/Seoul"))).toBe("Feb 2026");
    expect(formatMonth(new Date("2026-01-31T15:30:00Z"), style("en"))).toBe("Jan 2026");
  });

  it("utcOffsetMinutes — 초가 있는 순간도 분 단위로 맞다", () => {
    expect(utcOffsetMinutes(new Date("2026-01-15T12:00:59.999Z"), "Asia/Kolkata")).toBe(330);
    expect(utcOffsetMinutes(new Date("2026-01-15T12:00:59.999Z"), "UTC")).toBe(0);
  });
});

it.each([
  [0, "UTC"],
  [540, "UTC+9"],
  [330, "UTC+5:30"],
  [345, "UTC+5:45"],
  [-180, "UTC-3"],
  [-570, "UTC-9:30"],
  [60, "UTC+1"],
  [780, "UTC+13"],
])("③ offsetLabel(%i) → %s", (minutes, label) => {
  expect(offsetLabel(minutes)).toBe(label);
});

describe("⑤ startOfDay · addDays · dayKeyAt", () => {
  it("UTC는 그날 UTC 자정이다", () => {
    expect(startOfDay("2026-10-05", "UTC")).toEqual(new Date("2026-10-05T00:00:00.000Z"));
  });

  it("서울 10월 5일 0시는 10월 4일 15:00Z다", () => {
    expect(startOfDay("2026-10-05", "Asia/Seoul")).toEqual(new Date("2026-10-04T15:00:00.000Z"));
    expect(startOfDay("2026-10-05", "Asia/Kolkata")).toEqual(new Date("2026-10-04T18:30:00.000Z"));
  });

  it.each([
    // [키, 시간대, 첫 순간, 그날 길이(시간)]
    ["2026-03-08", "America/New_York", "2026-03-08T05:00:00.000Z", 23],
    ["2026-11-01", "America/New_York", "2026-11-01T04:00:00.000Z", 25],
    ["2026-03-29", "Europe/London", "2026-03-29T00:00:00.000Z", 23],
    ["2026-10-25", "Europe/London", "2026-10-24T23:00:00.000Z", 25],
    ["2026-04-05", "Australia/Sydney", "2026-04-04T13:00:00.000Z", 25],
    ["2026-07-15", "America/New_York", "2026-07-15T04:00:00.000Z", 24],
  ] as const)("서머타임 날 %s @ %s — 0시는 %s, 하루는 %i시간", (key, zone, first, hours) => {
    const start = startOfDay(key, zone);
    expect(start).toEqual(new Date(first));
    expect(startOfDay(addDays(key, 1), zone).getTime() - start.getTime()).toBe(hours * 60 * 60 * 1000);
  });

  /**
   * **0시가 없는 날**(design §2) — 자정에 시계가 1시로 넘어간다. 오프셋을 두 번 맞추기만 하면 전날 23시가 나온다.
   * 과거 사례가 아니다: 아래 여섯은 2026·2027년에 실제로 온다.
   */
  it.each([
    ["2026-09-06", "America/Santiago", "2026-09-06T04:00:00.000Z"],
    ["2027-09-05", "America/Santiago", "2027-09-05T04:00:00.000Z"],
    ["2026-03-29", "Atlantic/Azores", "2026-03-29T01:00:00.000Z"],
    ["2027-03-28", "Atlantic/Azores", "2027-03-28T01:00:00.000Z"],
    ["2026-04-24", "Africa/Cairo", "2026-04-23T22:00:00.000Z"],
    ["2027-04-30", "Africa/Cairo", "2027-04-29T22:00:00.000Z"],
  ] as const)("0시가 없는 날 %s @ %s — 그날 01:00이고 전날 23시가 아니다", (key, zone, first) => {
    const start = startOfDay(key, zone);
    expect(start).toEqual(new Date(first));
    expect(dayKeyAt(start, zone)).toBe(key);
    expect(zonedParts(start, zone)).toMatchObject({ h: 1, mi: 0 });
    // 1분 전은 전날이다 — 그날 첫 순간이다.
    expect(dayKeyAt(new Date(start.getTime() - 60_000), zone)).toBe(addDays(key, -1));
    // 그날은 23시간이다.
    expect(startOfDay(addDays(key, 1), zone).getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("자정이 지나면 같은 순간이 다른 키다", () => {
    const at = new Date("2026-10-04T23:10:00Z");
    expect(dayKeyAt(at, "UTC")).toBe("2026-10-04");
    expect(dayKeyAt(at, "Asia/Seoul")).toBe("2026-10-05");
    expect(dayKeyAt(at, "America/New_York")).toBe("2026-10-04");
    expect(dayKeyAt(new Date("2026-10-05T03:59:00Z"), "America/New_York")).toBe("2026-10-04");
  });

  it("addDays — 월말·연말·윤년을 넘는다", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-05", -29)).toBe("2026-09-06");
    expect(addDays("2026-10-05", 0)).toBe("2026-10-05");
  });
});

describe("⑥ zonedParts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("UTC에서는 Intl을 부르지 않는다 — 기본 경로의 바이트 동일성을 구조로 보장한다", () => {
    const spy = vi.spyOn(Intl, "DateTimeFormat");
    expect(zonedParts(new Date("2026-10-04T23:10:00Z"), "UTC")).toEqual({ y: 2026, mo: 9, d: 4, h: 23, mi: 10 });
    formatMinute(new Date("2026-10-04T23:10:00Z"), style("ko"));
    startOfDay("2026-10-05", "UTC");
    expect(spy).not.toHaveBeenCalled();
  });

  it("자정은 0시다 — 엔진이 h23에서 `24`를 내도 0으로 접는다", async () => {
    vi.resetModules();
    const real = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locale: string, options: Intl.DateTimeFormatOptions) {
      const formatter = new real(locale, options);
      return {
        formatToParts: (at: Date) => formatter.formatToParts(at).map((part) => (part.type === "hour" && part.value === "00" ? { ...part, value: "24" } : part)),
      };
    } as unknown as typeof Intl.DateTimeFormat);
    const fresh = await import("../date-format");
    expect(fresh.zonedParts(new Date("2026-10-04T15:05:00Z"), "Asia/Seoul")).toEqual({ y: 2026, mo: 9, d: 5, h: 0, mi: 5 });
    expect(fresh.formatClock(new Date("2026-10-04T15:05:00Z"), style("en", "Asia/Seoul"))).toBe("00:05 UTC+9");
  });

  it("Seoul 자정 직후의 부품", () => {
    expect(zonedParts(new Date("2026-10-04T15:05:00Z"), "Asia/Seoul")).toEqual({ y: 2026, mo: 9, d: 5, h: 0, mi: 5 });
  });
});

it.each([
  ["2026-10-05T09:42:00Z", "UTC", "09:42 UTC"],
  ["2026-10-04T23:10:00Z", "Asia/Seoul", "08:10 UTC+9"],
  ["2026-10-05T08:42:00Z", "Asia/Kolkata", "14:12 UTC+5:30"],
  ["2026-10-05T03:00:00Z", "America/New_York", "23:00 UTC-4"],
] as const)("⑦ formatClock %s @ %s → %s", (iso, zone, text) => {
  expect(formatClock(new Date(iso), style("en", zone))).toBe(text);
  // 언어와 무관하다.
  expect(formatClock(new Date(iso), style("ko", zone))).toBe(text);
});

it.each([
  ["2026-10-05", "Oct 5, 2026", "2026년 10월 5일", "5 oct 2026"],
  ["2026-01-01", "Jan 1, 2026", "2026년 1월 1일", "1 ene 2026"],
  ["2024-02-29", "Feb 29, 2024", "2024년 2월 29일", "29 feb 2024"],
  ["2026-09-06", "Sep 6, 2026", "2026년 9월 6일", "6 sept 2026"],
])("⑧ formatDayKey %s — 순간을 거치지 않고 그 날짜 그대로", (key, en, ko, es) => {
  expect(formatDayKey(key, "en")).toBe(en);
  expect(formatDayKey(key, "ko")).toBe(ko);
  expect(formatDayKey(key, "es")).toBe(es);
});

it("formatDayKey — 키 모양이 아니면 그대로 돌려준다(던지지 않는다)", () => {
  expect(formatDayKey("nope", "en")).toBe("nope");
});

/**
 * ⑨ **런타임 TZ를 바꿔도 출력이 같다** — 서버(UTC)와 브라우저(로컬)가 같은 문자열을 내는 것(하이드레이션)의 자동 대리.
 * 구조로 고정한다: 이 파일의 어떤 함수도 로컬 부품(`getHours`·`toLocale*`)을 읽지 않는다.
 */
it("⑨ 런타임 TZ 교체 불변 — UTC·서울·산티아고에서 같은 출력", () => {
  const original = process.env.TZ;
  const run = () => {
    const at = new Date("2026-09-06T03:30:00Z");
    return [
      formatDay(at, style("en", "Asia/Seoul")),
      formatMinute(at, style("ko", "America/Santiago")),
      formatMinute(at, style("es", "Asia/Kolkata")),
      formatMonth(at, style("en", "America/New_York")),
      formatClock(at, style("en", "Atlantic/Azores")),
      formatDayKey("2026-09-06", "en"),
      dayKeyAt(at, "America/Santiago"),
      startOfDay("2026-09-06", "America/Santiago").toISOString(),
      startOfDay("2026-03-08", "America/New_York").toISOString(),
      formatMinute(at, style("en")),
    ];
  };
  try {
    const outputs = ["UTC", "Asia/Seoul", "America/Santiago"].map((tz) => {
      process.env.TZ = tz;
      return run();
    });
    // 교체가 실제로 먹었다 — 공허하지 않다.
    expect(new Date("2026-09-06T03:30:00Z").getTimezoneOffset()).toBe(240);
    expect(outputs[1]).toEqual(outputs[0]);
    expect(outputs[2]).toEqual(outputs[0]);
  } finally {
    process.env.TZ = original;
  }
});
