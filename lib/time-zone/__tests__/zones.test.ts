// ⚠️ **import보다 먼저 선다** — 런타임 TZ를 UTC가 아닌 곳(분 단위 오프셋)에 두어야 "런타임 TZ를 읽지 않는다"가 CI(UTC)에서 공허하게 통과하지 않는다.
process.env.TZ = "Asia/Kathmandu";

import { describe, expect, it } from "vitest";

import { utcOffsetMinutes } from "@/lib/date-format";

import { DEFAULT_TIME_ZONE, TIME_ZONES, parseTimeZone, resolveTimeZone } from "../zones";

it("TZ가 실제로 카트만두다 — 이 가드가 없으면 아래 단언이 UTC 런타임에서 공허하다", () => {
  expect(new Date("2026-01-01T00:00:00Z").getTimezoneOffset()).toBe(-345);
});

describe("parseTimeZone", () => {
  it("선별 목록 안의 id는 그대로 통과한다", () => {
    for (const id of TIME_ZONES) expect(parseTimeZone(id)).toBe(id);
  });

  it.each([
    ["Mars/Base"],
    [""],
    ["__proto__"],
    ["constructor"],
    ["toString"],
    ["hasOwnProperty"],
    ["asia/seoul"],
    ["Asia/Seoul "],
    [" UTC"],
    ["utc"],
    // 런타임 Intl은 받지만 목록 밖이다 — 유효성을 Intl에 묻지 않는다.
    ["Asia/Calcutta"],
    ["Etc/GMT-9"],
  ])("목록 밖 문자열 %j는 null이다", (raw) => {
    expect(parseTimeZone(raw)).toBe(null);
  });

  it.each([[null], [undefined], [9], [540], [{}], [["UTC"]], [true]])("문자열이 아닌 %j는 null이다", (raw) => {
    expect(parseTimeZone(raw)).toBe(null);
  });
});

describe("resolveTimeZone", () => {
  it("목록 안이면 그 값, 밖이면 UTC다", () => {
    expect(resolveTimeZone("Asia/Seoul")).toBe("Asia/Seoul");
    expect(resolveTimeZone("UTC")).toBe("UTC");
    expect(resolveTimeZone(null)).toBe("UTC");
    expect(resolveTimeZone(undefined)).toBe("UTC");
    expect(resolveTimeZone("Asia/Calcutta")).toBe("UTC");
    expect(resolveTimeZone("__proto__")).toBe("UTC");
  });

  it("기본값은 UTC다", () => {
    expect(DEFAULT_TIME_ZONE).toBe("UTC");
  });
});

describe("TIME_ZONES", () => {
  it("UTC가 첫 줄이고 중복이 없다 — UTC + 41개", () => {
    expect(TIME_ZONES[0]).toBe("UTC");
    expect(new Set(TIME_ZONES).size).toBe(TIME_ZONES.length);
    expect(TIME_ZONES.length).toBe(42);
  });

  it("모든 id가 Intl.DateTimeFormat으로 생성된다(RangeError 없음)", () => {
    for (const id of TIME_ZONES) expect(() => new Intl.DateTimeFormat("en-US", { timeZone: id }), id).not.toThrow();
  });

  /**
   * id별 기대 오프셋(분) — 2026-01-15·2026-07-15 정오 UTC. **로컬(Node 26)과 CI(`.nvmrc` 24) 둘 다에서** 같다(P0 실측).
   * ⚠️ `resolvedOptions().timeZone`으로 정규 이름을 검사하지 않는다 — ICU가 `Asia/Kolkata`→`Asia/Calcutta`로 돌려준다(design §2.1).
   */
  const EXPECTED: readonly [string, number, number][] = [
    ["UTC", 0, 0],
    ["Pacific/Honolulu", -600, -600],
    ["America/Anchorage", -540, -480],
    ["America/Los_Angeles", -480, -420],
    ["America/Denver", -420, -360],
    ["America/Phoenix", -420, -420],
    ["America/Chicago", -360, -300],
    ["America/Mexico_City", -360, -360],
    ["America/New_York", -300, -240],
    ["America/Bogota", -300, -300],
    ["America/Lima", -300, -300],
    ["America/Halifax", -240, -180],
    ["America/Santiago", -180, -240],
    ["America/Sao_Paulo", -180, -180],
    ["America/Argentina/Buenos_Aires", -180, -180],
    ["Atlantic/Azores", -60, 0],
    ["Europe/London", 0, 60],
    ["Europe/Lisbon", 0, 60],
    ["Africa/Lagos", 60, 60],
    ["Europe/Madrid", 60, 120],
    ["Europe/Paris", 60, 120],
    ["Europe/Berlin", 60, 120],
    ["Africa/Cairo", 120, 180],
    ["Africa/Johannesburg", 120, 120],
    ["Europe/Athens", 120, 180],
    ["Europe/Istanbul", 180, 180],
    ["Europe/Moscow", 180, 180],
    ["Asia/Riyadh", 180, 180],
    ["Asia/Tehran", 210, 210],
    ["Asia/Dubai", 240, 240],
    ["Asia/Karachi", 300, 300],
    ["Asia/Kolkata", 330, 330],
    ["Asia/Kathmandu", 345, 345],
    ["Asia/Dhaka", 360, 360],
    ["Asia/Bangkok", 420, 420],
    ["Asia/Jakarta", 420, 420],
    ["Asia/Shanghai", 480, 480],
    ["Asia/Singapore", 480, 480],
    ["Asia/Seoul", 540, 540],
    ["Asia/Tokyo", 540, 540],
    ["Australia/Sydney", 660, 600],
    ["Pacific/Auckland", 780, 720],
  ];

  it("기대 표가 목록과 정확히 같은 id 집합이다", () => {
    expect(EXPECTED.map(([id]) => id)).toEqual([...TIME_ZONES]);
  });

  it.each(EXPECTED)("%s — 1월 %i분 · 7월 %i분", (id, january, july) => {
    const zone = parseTimeZone(id);
    expect(zone).not.toBe(null);
    if (zone === null) return;
    expect(utcOffsetMinutes(new Date("2026-01-15T12:00:00Z"), zone)).toBe(january);
    expect(utcOffsetMinutes(new Date("2026-07-15T12:00:00Z"), zone)).toBe(july);
  });
});
