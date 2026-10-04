import type { UiLocale } from "@/lib/i18n/locales";
import type { TimeZone } from "@/lib/time-zone/zones";

/**
 * 절대 날짜 `Sep 27, 2026` · 절대 시각 `Sep 27, 2026 16:34 UTC` · 달 `Sep 2026` — 앱의 절대 날짜·시각은 전부 이 파일을 지난다
 * (launch-readiness L7.1 — 표기는 2026-09-28 changelog에서 날짜만 쓰는 자리와 한 형으로 모았다).
 *
 * **보는 사람이 고른 시간대(기본 UTC)로 말하고, 시각에는 그 오프셋을 라벨로 단다**(user-timezone — `UTC` · `UTC+9` · `UTC+5:30`).
 * 막으려는 것은 **라벨 없는 로컬 시각**이다 — 서버 렌더의 `toLocaleString`은 서버 타임존(Vercel은 UTC)일 뿐이고, 클라이언트에서
 * 런타임 TZ로 내면 보는 사람이 어느 시간대인지 모르고 밤 사이 실행의 날짜를 하루 어긋나게 센다. 정확한 값은 호출부의 `<time dateTime>`(UTC ISO)이 든다.
 * 상대 시각은 `lib/relative-time.ts`다.
 *
 * ⚠️ **`Intl.DateTimeFormat`은 이 파일에서만, `timeZone`을 명시한 숫자 부품 추출(`zonedParts`)에만 쓴다.** 런타임 TZ를 읽을 길이 없어
 * 서버와 브라우저가 같은 부품을 뽑는다. 월 이름·어순·라벨은 손으로 조립한다 — 로케일 문자열 출력은 ICU 빌드마다 다르다
 * (POSTMORTEM 2026-09-20 — `toLocale*` grep 0건 규칙).
 *
 * **화면 언어(`uiLocale`)별 형식도 손으로 만든다**(ui-locales) — en `Sep 27, 2026` · ko `2026년 9월 27일` · es `27 sept 2026`.
 *
 * ⚠️ **잎이다 — 값 import가 0이다**(화면 언어·시간대 타입만 읽는다. `Intl`은 전역이다). 클라이언트 컴포넌트(`publish-button.tsx`)가 값으로 읽는다.
 */

/** 날짜 포맷의 입력 — 화면 언어와 시간대. */
export type DateStyle = { readonly uiLocale: UiLocale; readonly timeZone: TimeZone };

/** 한 순간의 그 시간대 부품. `mo`는 `Date`처럼 0부터다. */
type ZonedParts = { y: number; mo: number; d: number; h: number; mi: number };

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** CLDR es 약어 — 9월은 `sept`다(`sep`이 아니다). 마침표를 달지 않는다. */
const ES_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"] as const;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** 시간대별 포맷터 — 생성이 비싸서 모듈 수명 동안 하나씩 둔다. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: TimeZone): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * 그 시간대의 숫자 부품. **`UTC`는 `getUTC*`로 직행한다** — 기본 경로에 Intl이 없어 옛 `utcDay`·`utcMinute`와 바이트가 같다.
 * ⚠️ `h === 24`는 0으로 접는다 — 구 엔진은 `hour12: false`의 자정을 `24`로 냈다.
 */
export function zonedParts(at: Date, timeZone: TimeZone): ZonedParts {
  if (timeZone === "UTC") {
    return { y: at.getUTCFullYear(), mo: at.getUTCMonth(), d: at.getUTCDate(), h: at.getUTCHours(), mi: at.getUTCMinutes() };
  }
  let y = 0;
  let mo = 0;
  let d = 0;
  let h = 0;
  let mi = 0;
  for (const part of formatterFor(timeZone).formatToParts(at)) {
    if (part.type === "year") y = Number(part.value);
    else if (part.type === "month") mo = Number(part.value) - 1;
    else if (part.type === "day") d = Number(part.value);
    else if (part.type === "hour") h = Number(part.value) % 24;
    else if (part.type === "minute") mi = Number(part.value);
  }
  return { y, mo, d, h, mi };
}

/**
 * 그 순간의 UTC 오프셋(분). 초·밀리초는 분으로 내려 버린다(`…:59.999Z`도 맞다).
 * `Math.floor`라 1970년 이전(음수 epoch)에서도 내림 방향이 같다 — `Intl` 부품도 그 분을 가리킨다.
 */
export function utcOffsetMinutes(at: Date, timeZone: TimeZone): number {
  if (timeZone === "UTC") return 0;
  const { y, mo, d, h, mi } = zonedParts(at, timeZone);
  return (Date.UTC(y, mo, d, h, mi) - Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS) / MINUTE_MS;
}

/**
 * `0 → UTC` · `540 → UTC+9` · `330 → UTC+5:30` · `-570 → UTC-9:30`. 약어(`KST`)는 쓰지 않는다.
 * ⚠️ 부호는 ASCII `-`다 — 유니코드 마이너스는 복사·검색에서 갈린다.
 */
export function offsetLabel(minutes: number): string {
  if (minutes === 0) return "UTC";
  const abs = Math.abs(minutes);
  const m = abs % 60;
  return `UTC${minutes < 0 ? "-" : "+"}${Math.floor(abs / 60)}${m === 0 ? "" : `:${pad2(m)}`}`;
}

function dayText(y: number, mo: number, d: number, uiLocale: UiLocale): string {
  if (uiLocale === "ko") return `${y}년 ${mo + 1}월 ${d}일`;
  if (uiLocale === "es") return `${d} ${ES_MONTHS[mo]} ${y}`;
  return `${EN_MONTHS[mo]} ${d}, ${y}`;
}

export function formatDay(at: Date, style: DateStyle): string {
  const { y, mo, d } = zonedParts(at, style.timeZone);
  return dayText(y, mo, d, style.uiLocale);
}

export function formatMinute(at: Date, style: DateStyle): string {
  const { y, mo, d, h, mi } = zonedParts(at, style.timeZone);
  return `${dayText(y, mo, d, style.uiLocale)} ${pad2(h)}:${pad2(mi)} ${offsetLabel(utcOffsetMinutes(at, style.timeZone))}`;
}

/** 날짜가 과한 자리(계정 병합 확인의 가입 시점)의 형 — 로케일 포맷터 대신 같은 월 약어를 쓴다. */
export function formatMonth(at: Date, style: DateStyle): string {
  const { y, mo } = zonedParts(at, style.timeZone);
  if (style.uiLocale === "ko") return `${y}년 ${mo + 1}월`;
  if (style.uiLocale === "es") return `${ES_MONTHS[mo]} ${y}`;
  return `${EN_MONTHS[mo]} ${y}`;
}

/** Logs 행의 시각 — `09:42 UTC` · `08:10 UTC+9`. 날짜는 카드 머리가 말하므로 시각과 오프셋만이다. */
export function formatClock(at: Date, style: DateStyle): string {
  const { h, mi } = zonedParts(at, style.timeZone);
  return `${pad2(h)}:${pad2(mi)} ${offsetLabel(utcOffsetMinutes(at, style.timeZone))}`;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 달력 날짜 키 `YYYY-MM-DD`를 **순간으로 바꾸지 않고** 언어별 날짜 형으로 그린다(Logs 카드 머리·필터 칩).
 * ⚠️ 키로 순간을 만들어(`new Date(key)` · `startOfDay`) `formatDay`에 넘기면 음수 오프셋에서 하루 밀린다.
 * 키 모양이 아니면 그대로 돌려준다 — 화면 글자라 던지지 않는다.
 */
export function formatDayKey(key: string, uiLocale: UiLocale): string {
  const match = DAY_KEY.exec(key);
  if (match === null) return key;
  return dayText(Number(match[1]), Number(match[2]) - 1, Number(match[3]), uiLocale);
}

/** 그 시간대의 달력 날짜 `YYYY-MM-DD` — Logs 그룹 키·프리셋의 오늘. */
export function dayKeyAt(at: Date, timeZone: TimeZone): string {
  const { y, mo, d } = zonedParts(at, timeZone);
  return `${String(y).padStart(4, "0")}-${pad2(mo + 1)}-${pad2(d)}`;
}

/**
 * 달력 날짜 산술 — 시간대와 무관하다. `Yesterday`·`Last 7 days`는 `now - 24h`가 아니라 이것이다(서머타임 날은 23·25시간).
 * 입력은 유효한 키여야 한다(호출부가 `dayKeyAt`·`parseDayKey`를 지난 값을 넘긴다).
 */
export function addDays(dayKey: string, n: number): string {
  const at = new Date(`${dayKey}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
}

/**
 * 그 시간대에서 그날의 첫 순간(보통 0시). 오프셋을 두 번 맞춰 전환일을 따라간다.
 *
 * ⚠️ **0시가 없는 날이 있다** — 자정에 시계를 1시로 넘기는 시간대(`America/Santiago` 9월 · `Atlantic/Azores` 3월 · `Africa/Cairo` 4월)는
 * 두 번 맞춘 결과가 **전날 23시**로 떨어진다. 그때는 그날 첫 순간(전환 순간)까지 전진시킨다 — 안 하면 Logs 구간과 카드가 전날 한 시간을 먹는다.
 */
export function startOfDay(dayKey: string, timeZone: TimeZone): Date {
  const midnight = new Date(`${dayKey}T00:00:00.000Z`).getTime();
  if (timeZone === "UTC") return new Date(midnight);
  let at = midnight - utcOffsetMinutes(new Date(midnight), timeZone) * MINUTE_MS;
  at = midnight - utcOffsetMinutes(new Date(at), timeZone) * MINUTE_MS;
  if (dayKeyAt(new Date(at), timeZone) !== dayKey) {
    at += (utcOffsetMinutes(new Date(at + HOUR_MS), timeZone) - utcOffsetMinutes(new Date(at), timeZone)) * MINUTE_MS;
  }
  return new Date(at);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
