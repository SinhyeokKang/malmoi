/**
 * **보는 사람이 고를 수 있는 시간대의 선별 목록과 판정**(user-timezone) — 절대 날짜·시각과 Logs 날짜 경계가 이 값을 따른다.
 *
 * ⚠️ **런타임 `Intl`에 유효성을 묻지 않는다** — ICU 빌드마다 받는 id가 다르고, 받는 이름을 정규화해 돌려주기도 한다
 * (`Asia/Kolkata`→`Asia/Calcutta`). 저장·비교·표시는 이 목록의 id 문자열만 쓴다.
 *
 * ⚠️ **목록에서 id를 빼면 그 값을 저장한 사용자가 UTC로 떨어진다** — 마이그레이션 없이 되지만 사람의 설정이 조용히 바뀐다.
 *
 * ⚠️ **잎이다 — import가 0이다.** Preferences 카드(클라이언트)가 값으로 읽는다(`components/__tests__/client-graph.test.ts`).
 */
export const TIME_ZONES = [
  "UTC",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/Mexico_City",
  "America/New_York",
  "America/Bogota",
  "America/Lima",
  "America/Halifax",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Atlantic/Azores",
  "Europe/London",
  "Europe/Lisbon",
  "Africa/Lagos",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Asia/Riyadh",
  "Asia/Tehran",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;
export type TimeZone = (typeof TIME_ZONES)[number];

export const DEFAULT_TIME_ZONE: TimeZone = "UTC";

/** 판정 표 — own key로 지원 여부를 본다. */
const SUPPORTED: Record<string, true> = Object.fromEntries(TIME_ZONES.map((id) => [id, true]));

/**
 * DB 값은 남이 정한 값이다 — 목록 밖이면 `null`.
 * ⚠️ **`Object.hasOwn`으로 판정한다** — `in`·`?? 폴백`은 `__proto__`·`constructor`·`toString`을 통과시킨다(CLAUDE.md).
 * 대소문자·공백을 정규화하지 않는다 — 쓰는 쪽이 우리뿐이다.
 */
export function parseTimeZone(raw: unknown): TimeZone | null {
  return typeof raw === "string" && Object.hasOwn(SUPPORTED, raw) ? (raw as TimeZone) : null;
}

/** 계정 값 → 시간대. 쿠키 층이 없다(spec 결정) — 고르지 않았거나 목록 밖이면 UTC다. */
export function resolveTimeZone(account: unknown): TimeZone {
  return parseTimeZone(account) ?? DEFAULT_TIME_ZONE;
}
