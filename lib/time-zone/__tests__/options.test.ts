// ⚠️ **import보다 먼저 선다** — 런타임 TZ를 UTC가 아닌 곳(분 단위 오프셋)에 두어야 "런타임 TZ를 읽지 않는다"가 CI(UTC)에서 공허하게 통과하지 않는다.
process.env.TZ = "Asia/Kathmandu";

import { expect, it } from "vitest";

import { utcOffsetMinutes } from "@/lib/date-format";

import { timeZoneOptions } from "../options";
import { TIME_ZONES } from "../zones";

const JANUARY = new Date("2026-01-15T12:00:00Z");
const JULY = new Date("2026-07-15T12:00:00Z");

it("TZ가 실제로 카트만두다 — 이 가드가 없으면 아래 단언이 UTC 런타임에서 공허하다", () => {
  expect(new Date("2026-01-01T00:00:00Z").getTimezoneOffset()).toBe(-345);
});

it("첫 줄은 UTC이고 라벨도 `UTC`다", () => {
  expect(timeZoneOptions(JANUARY)[0]).toEqual({ value: "UTC", label: "UTC" });
});

it("목록의 id가 빠짐없이 한 번씩 나온다", () => {
  const values = timeZoneOptions(JANUARY).map((option) => option.value);
  expect([...values].sort()).toEqual([...TIME_ZONES].sort());
});

it.each([[JANUARY], [JULY]])("UTC 다음은 `now`의 오프셋 오름차순, 같은 오프셋은 id 순이다 (%s)", (now) => {
  const rest = timeZoneOptions(now).slice(1);
  for (let i = 1; i < rest.length; i++) {
    const prev = rest[i - 1]!;
    const next = rest[i]!;
    const a = utcOffsetMinutes(now, prev.value);
    const b = utcOffsetMinutes(now, next.value);
    expect(a < b || (a === b && prev.value < next.value), `${prev.value} → ${next.value}`).toBe(true);
  }
  expect(rest[0]?.value).toBe("Pacific/Honolulu");
  expect(rest.at(-1)?.value).toBe("Pacific/Auckland");
});

it("라벨은 `오프셋 · id`이고 오프셋은 `now`에서 잰다 — 뉴욕은 1월 UTC-5, 7월 UTC-4", () => {
  const label = (now: Date, id: string) => timeZoneOptions(now).find((option) => option.value === id)?.label;
  expect(label(JANUARY, "America/New_York")).toBe("UTC-5 · America/New_York");
  expect(label(JULY, "America/New_York")).toBe("UTC-4 · America/New_York");
  expect(label(JANUARY, "Asia/Seoul")).toBe("UTC+9 · Asia/Seoul");
  expect(label(JANUARY, "Asia/Kolkata")).toBe("UTC+5:30 · Asia/Kolkata");
  expect(label(JANUARY, "Asia/Kathmandu")).toBe("UTC+5:45 · Asia/Kathmandu");
  expect(label(JANUARY, "America/Argentina/Buenos_Aires")).toBe("UTC-3 · America/Argentina/Buenos_Aires");
});

it("오프셋 0인 옵션은 `UTC+0`으로 쓴다 — 첫 줄 `UTC`와 구분한다", () => {
  const options = timeZoneOptions(JANUARY);
  expect(options.find((option) => option.value === "Europe/London")?.label).toBe("UTC+0 · Europe/London");
  expect(options.find((option) => option.value === "Europe/Lisbon")?.label).toBe("UTC+0 · Europe/Lisbon");
  // 7월의 아조레스도 0이다.
  expect(timeZoneOptions(JULY).find((option) => option.value === "Atlantic/Azores")?.label).toBe("UTC+0 · Atlantic/Azores");
  expect(options.filter((option) => option.label === "UTC")).toHaveLength(1);
});

it("같은 오프셋 묶음은 id 순이다 — 1월 UTC+0: Europe/Lisbon → Europe/London", () => {
  const values = timeZoneOptions(JANUARY).map((option) => option.value);
  expect(values.indexOf("Europe/Lisbon")).toBeLessThan(values.indexOf("Europe/London"));
  expect(values.indexOf("Asia/Seoul")).toBeLessThan(values.indexOf("Asia/Tokyo"));
});
